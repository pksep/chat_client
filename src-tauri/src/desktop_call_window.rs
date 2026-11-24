use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    webview::NewWindowResponse, AppHandle, Manager, Runtime, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

pub const CALL_WINDOW_LABEL: &str = "call";

#[derive(Default)]
pub struct DesktopCallWindow {
    available: AtomicBool,
}

pub fn is_call_window_url(url: &tauri::Url) -> bool {
    url.scheme() == "about"
        && url.path() == "blank"
        && url.query().is_none()
        && url.fragment() == Some("sep-chat-call")
}

pub fn create_main_window<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    if app.get_webview_window("main").is_some() {
        return Ok(());
    }
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "main")
        .ok_or_else(|| tauri::Error::WindowNotFound)?;
    let handle = app.handle().clone();
    WebviewWindowBuilder::from_config(app, config)?
        .on_new_window(move |url, features| {
            // Только собственная пустая поверхность: никакой загрузки внешнего сайта
            // и второго экземпляра приложения/RTC-контроллера.
            if !is_call_window_url(&url) || handle.get_webview_window(CALL_WINDOW_LABEL).is_some() {
                return NewWindowResponse::Deny;
            }
            let window = WebviewWindowBuilder::new(
                &handle,
                CALL_WINDOW_LABEL,
                WebviewUrl::External("about:blank".parse().expect("Корректный about:blank")),
            )
            .window_features(features)
            .title("Звонок — СЭП Чат")
            .inner_size(960.0, 720.0)
            .min_inner_size(420.0, 400.0)
            .decorations(false)
            .visible(false)
            .center()
            .on_navigation(|url| is_call_window_url(url) || url.as_str() == "about:blank")
            .build();
            match window {
                Ok(window) => NewWindowResponse::Create { window },
                Err(error) => {
                    eprintln!("Не удалось открыть отдельное окно звонка: {error}");
                    NewWindowResponse::Deny
                }
            }
        })
        .build()?;
    app.state::<DesktopCallWindow>()
        .available
        .store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn desktop_call_window_available<R: Runtime>(window: WebviewWindow<R>) -> bool {
    window.label() == "main"
        && window
            .state::<DesktopCallWindow>()
            .available
            .load(Ordering::SeqCst)
}

pub fn close_call_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(CALL_WINDOW_LABEL) {
        window.destroy().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn desktop_close_call_window<R: Runtime>(window: WebviewWindow<R>) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Окно звонка управляется основным окном чата".into());
    }
    close_call_window(window.app_handle())
}
