use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use std::time::{Duration, Instant};
use tauri::{
    webview::NewWindowResponse, AppHandle, Manager, Runtime, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

pub const CALL_WINDOW_LABEL: &str = "call";

fn native_chrome<'a, R: Runtime, M: Manager<R>>(
    builder: WebviewWindowBuilder<'a, R, M>,
) -> WebviewWindowBuilder<'a, R, M> {
    #[cfg(target_os = "macos")]
    {
        builder
            .decorations(true)
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
    }
    #[cfg(not(target_os = "macos"))]
    {
        builder
    }
}

fn finish_native_chrome<R: Runtime>(_window: &WebviewWindow<R>) {
    #[cfg(target_os = "macos")]
    if let Ok(pointer) = _window.ns_window() {
        // AppKit сохраняет нативную рамку и скругления. Кнопки остаются в шапке чата.
        // Вызывается сразу после build в главном потоке AppKit.
        let window = unsafe { &*pointer.cast::<objc2_app_kit::NSWindow>() };
        for kind in [
            objc2_app_kit::NSWindowButton::CloseButton,
            objc2_app_kit::NSWindowButton::MiniaturizeButton,
            objc2_app_kit::NSWindowButton::ZoomButton,
        ] {
            if let Some(button) = window.standardWindowButton(kind) {
                button.setHidden(true);
            }
        }
    }
}

#[derive(Default)]
pub struct DesktopCallWindow {
    available: AtomicBool,
    last_error: Mutex<Option<String>>,
    prepared_until: Mutex<Option<Instant>>,
}

fn popup_error<R: Runtime>(app: &AppHandle<R>, message: &str) {
    *app.state::<DesktopCallWindow>().last_error.lock().unwrap() = Some(message.into());
}

pub fn is_call_window_url(url: &tauri::Url) -> bool {
    url.as_str() == "about:blank%23sep-chat-call"
        || (url.scheme() == "about"
            && url.path() == "blank"
            && url.query().is_none()
            && url.fragment() == Some("sep-chat-call"))
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
    let main_builder = WebviewWindowBuilder::from_config(app, config)?;
    #[cfg(windows)]
    let main_builder = main_builder.data_directory(app.path().app_local_data_dir()?);
    #[cfg(target_os = "macos")]
    let main_builder = {
        let main_thread = objc2::MainThreadMarker::new()
            .expect("Основное окно создаётся в главном потоке AppKit");
        let configuration = unsafe { objc2_web_kit::WKWebViewConfiguration::new(main_thread) };
        // WebKit блокирует окно входящего звонка без user activation. Настройка
        // применяется до создания WKWebView; configuration у готового view — копия.
        unsafe {
            configuration
                .preferences()
                .setJavaScriptCanOpenWindowsAutomatically(true);
        }
        main_builder.with_webview_configuration(configuration)
    };
    let window = native_chrome(main_builder)
        .on_new_window(move |url, features| {
            // Только собственная пустая поверхность: никакой загрузки внешнего сайта
            // и второго экземпляра приложения/RTC-контроллера.
            let prepared = handle
                .state::<DesktopCallWindow>()
                .prepared_until
                .lock()
                .unwrap()
                .take()
                .is_some_and(|until| Instant::now() <= until);
            // WKWebView может убрать fragment в запросе createWebView. Голый
            // about:blank принимается только после подготовки из главного окна.
            if !is_call_window_url(&url) && !(prepared && url.as_str() == "about:blank") {
                popup_error(
                    &handle,
                    &format!(
                        "unexpected-url:{}:blank={}:fragment={}",
                        url.scheme(),
                        url.path() == "blank",
                        url.fragment().is_some()
                    ),
                );
                return NewWindowResponse::Deny;
            }
            if handle.get_webview_window(CALL_WINDOW_LABEL).is_some() {
                popup_error(&handle, "window-already-exists");
                return NewWindowResponse::Deny;
            }
            *handle
                .state::<DesktopCallWindow>()
                .last_error
                .lock()
                .unwrap() = None;
            let window = native_chrome(
                WebviewWindowBuilder::new(
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
                .center(),
            )
            .on_navigation(|url| is_call_window_url(url) || url.as_str() == "about:blank")
            .build();
            match window {
                Ok(window) => {
                    finish_native_chrome(&window);
                    NewWindowResponse::Create { window }
                }
                Err(error) => {
                    popup_error(&handle, "native-build-failed");
                    eprintln!("Не удалось открыть отдельное окно звонка: {error}");
                    NewWindowResponse::Deny
                }
            }
        })
        .build()?;
    finish_native_chrome(&window);
    #[cfg(target_os = "linux")]
    window.with_webview(|view| {
        use webkit2gtk::{SettingsExt, WebViewExt};
        if let Some(settings) = view.inner().settings() {
            // Входящий вызов и открытие после IPC не имеют browser user activation.
            // on_new_window выше по-прежнему допускает только нашу поверхность.
            settings.set_javascript_can_open_windows_automatically(true);
        }
    })?;
    app.state::<DesktopCallWindow>()
        .available
        .store(true, Ordering::SeqCst);
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CallWindowCapabilities {
    available: bool,
    version: String,
    os: &'static str,
    pin_supported: bool,
    last_error: Option<String>,
}

#[tauri::command]
pub fn desktop_call_window_capabilities<R: Runtime>(
    window: WebviewWindow<R>,
    prepare: Option<bool>,
) -> Result<CallWindowCapabilities, String> {
    if window.label() != "main" {
        return Err("Окно звонка управляется основным окном чата".into());
    }
    let state = window.state::<DesktopCallWindow>();
    if prepare == Some(true) {
        *state.prepared_until.lock().unwrap() = Some(Instant::now() + Duration::from_secs(10));
        *state.last_error.lock().unwrap() = None;
    }
    let pin_supported = !cfg!(target_os = "linux")
        || std::env::var("WAYLAND_DISPLAY")
            .unwrap_or_default()
            .is_empty()
        || std::env::var("GDK_BACKEND").unwrap_or_default() == "x11";
    let last_error = state.last_error.lock().unwrap().clone();
    Ok(CallWindowCapabilities {
        available: state.available.load(Ordering::SeqCst),
        version: window.app_handle().package_info().version.to_string(),
        os: std::env::consts::OS,
        pin_supported,
        last_error,
    })
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
