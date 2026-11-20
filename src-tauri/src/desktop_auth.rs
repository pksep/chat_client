use reqwest::{header, Method, Url};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, time::Duration};
use tauri::{webview::cookie::Cookie, Runtime, WebviewWindow};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthRequest {
    url: String,
    method: String,
    headers: HashMap<String, String>,
    data: Option<serde_json::Value>,
}

#[derive(Serialize)]
pub struct AuthResponse {
    status: u16,
    body: String,
}

fn auth_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "Некорректный адрес авторизации")?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if (url.scheme() != "https" && !(local && url.scheme() == "http"))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || !url.path().split('/').any(|segment| segment == "auth")
    {
        return Err("Недопустимый адрес авторизации".into());
    }
    Ok(url)
}

fn is_refresh_cookie(name: &str) -> bool {
    matches!(name, "chat_refresh_token" | "refresh_token")
}

fn response_cookie(value: &str, url: &Url) -> Option<Cookie<'static>> {
    let mut cookie = Cookie::parse(value.to_owned()).ok()?;
    if !is_refresh_cookie(cookie.name()) {
        return None;
    }
    // Cookie сессии остаётся у сервера, выдавшего её, и недоступна JavaScript.
    cookie.set_domain(url.host_str()?.to_owned());
    cookie.set_http_only(true);
    if url.scheme() == "https" {
        cookie.set_secure(true);
    }
    if cookie.path().is_none() {
        let path = url
            .path()
            .rsplit_once('/')
            .map(|(path, _)| path)
            .unwrap_or("");
        cookie.set_path(if path.is_empty() { "/" } else { path }.to_owned());
    }
    Some(cookie)
}

fn expired(cookie: &Cookie<'_>) -> bool {
    if let Some(max_age) = cookie.max_age() {
        return max_age.whole_seconds() <= 0;
    }
    cookie
        .expires_datetime()
        .is_some_and(|expiry| expiry <= tauri::webview::cookie::time::OffsetDateTime::now_utc())
}

#[tauri::command]
pub async fn desktop_auth_request<R: Runtime>(
    webview: WebviewWindow<R>,
    options: AuthRequest,
) -> Result<AuthResponse, String> {
    let url = auth_url(&options.url)?;
    let method = match options.method.as_str() {
        "GET" => Method::GET,
        "POST" => Method::POST,
        _ => return Err("Неподдерживаемый метод авторизации".into()),
    };
    let cookie_window = webview.clone();
    let cookie_url = url.clone();
    let cookies =
        tauri::async_runtime::spawn_blocking(move || cookie_window.cookies_for_url(cookie_url))
            .await
            .map_err(|_| "Не удалось прочитать сессию")?
            .map_err(|_| "Не удалось прочитать сессию")?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(3500))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Не удалось создать запрос авторизации")?;
    let mut request = client.request(method, url.clone());
    for (name, value) in options.headers {
        // Cookie берём только из нативного хранилища для адреса запроса.
        if matches!(
            name.to_ascii_lowercase().as_str(),
            "accept" | "content-type" | "authorization"
        ) {
            request = request.header(name, value);
        }
    }
    let cookie_header = cookies
        .iter()
        .filter(|cookie| is_refresh_cookie(cookie.name()) && !expired(cookie))
        .map(|cookie| format!("{}={}", cookie.name(), cookie.value()))
        .collect::<Vec<_>>()
        .join("; ");
    if !cookie_header.is_empty() {
        request = request.header(header::COOKIE, cookie_header);
    }
    request = request
        .header(header::CACHE_CONTROL, "no-store")
        .header(header::USER_AGENT, "SEP Chat Desktop");
    if let Some(data) = options.data {
        request = request.body(data.to_string());
    }
    let response = request
        .send()
        .await
        .map_err(|_| "Не удалось связаться с сервером авторизации")?;
    let status = response.status().as_u16();
    let cookies: Vec<_> = response
        .headers()
        .get_all(header::SET_COOKIE)
        .iter()
        .filter_map(|value| {
            value
                .to_str()
                .ok()
                .and_then(|value| response_cookie(value, &url))
        })
        .collect();
    // Ротация должна сохраниться и при обрыве чтения тела ответа.
    tauri::async_runtime::spawn_blocking(move || -> tauri::Result<()> {
        for cookie in cookies {
            if expired(&cookie) {
                webview.delete_cookie(cookie)?;
            } else {
                webview.set_cookie(cookie)?;
            }
        }
        Ok(())
    })
    .await
    .map_err(|_| "Не удалось сохранить сессию")?
    .map_err(|_| "Не удалось сохранить сессию")?;
    let body = response
        .text()
        .await
        .map_err(|_| "Не удалось прочитать ответ авторизации")?;
    Ok(AuthResponse { status, body })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_http_sends_json_and_does_not_follow_auth_redirects() {
        use std::io::{BufRead, BufReader, Read, Write};
        use std::net::TcpListener;

        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let window = tauri::WebviewWindowBuilder::new(
            &app,
            "main",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .build()
        .unwrap();
        for status in [200, 401, 302] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let server = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut reader = BufReader::new(&stream);
                let mut headers = Vec::new();
                loop {
                    let mut line = String::new();
                    reader.read_line(&mut line).unwrap();
                    if line == "\r\n" {
                        break;
                    }
                    assert!(!line.is_empty());
                    headers.push(line.trim().to_owned());
                }
                let length: usize = headers
                    .iter()
                    .find_map(|line| {
                        line.to_ascii_lowercase()
                            .strip_prefix("content-length: ")
                            .and_then(|value| value.parse().ok())
                    })
                    .unwrap();
                let mut body = vec![0; length];
                reader.read_exact(&mut body).unwrap();
                let response_body = r#"{"code":"TEST_RESPONSE"}"#;
                write!(stream, "HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\nLocation: https://example.invalid/auth/login\r\nSet-Cookie: chat_refresh_token=test; Path=/api/auth; Max-Age=2592000; HttpOnly; SameSite=Lax\r\n\r\n{response_body}", response_body.len()).unwrap();
                (headers, body)
            });
            let result = tauri::async_runtime::block_on(desktop_auth_request(
                window.clone(),
                AuthRequest {
                    url: format!("http://{address}/api/auth/credentials-login"),
                    method: "POST".into(),
                    headers: HashMap::from([
                        ("Content-Type".into(), "application/json".into()),
                        ("Cookie".into(), "untrusted-cookie=must-not-be-sent".into()),
                    ]),
                    data: Some(
                        serde_json::json!({ "identifier": "fixture", "password": "fixture" }),
                    ),
                },
            ))
            .unwrap();
            assert_eq!(result.status, status);
            assert_eq!(result.body, r#"{"code":"TEST_RESPONSE"}"#);
            let (headers, body) = server.join().unwrap();
            assert_eq!(headers[0], "POST /api/auth/credentials-login HTTP/1.1");
            assert!(!headers
                .iter()
                .any(|line| line.to_ascii_lowercase().starts_with("cookie:")));
            assert_eq!(
                serde_json::from_slice::<serde_json::Value>(&body).unwrap()["identifier"],
                "fixture"
            );
        }
    }

    #[test]
    fn auth_transport_requires_tls_and_auth_path() {
        assert!(auth_url("https://chat-server-prod.pksep.ru/api/auth/refresh").is_ok());
        assert!(auth_url("http://localhost:5207/api/v2/auth/qr").is_ok());
        for url in [
            "http://example.com/api/auth/refresh",
            "https://example.com/api/users",
            "https://user:secret@example.com/auth/login",
            "file:///auth/login",
        ] {
            assert!(auth_url(url).is_err());
        }
    }

    #[test]
    fn refresh_cookie_keeps_lifetime_and_server_scope() {
        let url = auth_url("https://chat-server-prod.pksep.ru/api/auth/credentials-login").unwrap();
        let cookie = response_cookie("chat_refresh_token=test; Path=/api/auth; Domain=.pksep.ru; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure", &url).unwrap();
        assert_eq!(cookie.domain(), Some("chat-server-prod.pksep.ru"));
        assert_eq!(cookie.path(), Some("/api/auth"));
        assert_eq!(cookie.max_age().unwrap().whole_seconds(), 2592000);
        assert_eq!(cookie.http_only(), Some(true));
        assert_eq!(cookie.secure(), Some(true));
        assert!(!expired(&cookie));
        assert!(response_cookie("unrelated=value", &url).is_none());
    }

    #[test]
    fn logout_cookie_and_expired_cookie_are_deleted() {
        let url = auth_url("https://chat-server-prod.pksep.ru/api/auth/logout").unwrap();
        for value in [
            "chat_refresh_token=; Max-Age=0; Path=/api/auth",
            "chat_refresh_token=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/api/auth",
        ] {
            assert!(expired(&response_cookie(value, &url).unwrap()));
        }
    }
}
