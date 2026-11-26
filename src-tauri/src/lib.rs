#[cfg(desktop)]
mod desktop_agent;

use serde::Serialize;
use std::process::Command;
use tauri::{Manager, WindowEvent};
mod desktop_auth;
#[cfg(windows)]
mod desktop_recovery;
#[cfg(windows)]
mod desktop_autostart;
#[cfg(desktop)]
mod desktop_call_controls;
#[cfg(desktop)]
mod desktop_call_window;
mod desktop_files;
#[cfg(desktop)]
mod desktop_media_permissions;
mod desktop_notifications;
#[cfg(desktop)]
mod desktop_permission_preferences;
#[cfg(desktop)]
mod desktop_screen_capture;
#[cfg(windows)]
mod desktop_vpn;

#[cfg(desktop)]
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};

#[cfg(desktop)]
use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Runtime, State, WebviewWindow,
};

#[cfg(desktop)]
use tauri_plugin_autostart::MacosLauncher;
#[cfg(desktop)]
use tauri_plugin_deep_link::DeepLinkExt;

#[cfg(all(desktop, not(windows)))]
use tauri_plugin_autostart::ManagerExt as AutostartExt;

#[cfg(windows)]
use windows::{
    core::{IInspectable, Interface, HSTRING},
    Data::Xml::Dom::XmlDocument,
    Foundation::{IPropertyValue, TypedEventHandler},
    UI::Notifications::{ToastActivatedEventArgs, ToastNotification, ToastNotificationManager},
};

#[cfg(desktop)]
const AUTOSTART_ARG: &str = "--autostart";

#[cfg(desktop)]
const TRAY_SHOW_ID: &str = "tray-show";

#[cfg(desktop)]
const TRAY_INSPECT_ID: &str = "tray-inspect";

#[cfg(desktop)]
const TRAY_MINIMIZE_ID: &str = "tray-minimize";

#[cfg(desktop)]
const TRAY_QUIT_ID: &str = "tray-quit";

#[cfg(desktop)]
const NOTIFICATION_CLICK_EVENT: &str = "sep-chat://notification-click";

#[cfg(desktop)]
const WINDOW_STATE_EVENT: &str = "sep-chat://window-state";

#[cfg(desktop)]
#[derive(Default)]
struct AppLifecycleState {
    is_quitting: AtomicBool,
    is_hidden: AtomicBool,
}

#[cfg(desktop)]
#[derive(Default)]
struct PendingNotificationTarget(Mutex<Option<String>>);

#[cfg(desktop)]
#[derive(Clone, Serialize)]
struct WindowStatePayload {
    label: String,
    focused: bool,
    minimized: bool,
    visible: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VpnStatusPayload {
    is_active: bool,
    adapter_names: Vec<String>,
}

#[cfg(desktop)]
fn emit_window_state<R: Runtime>(app: &AppHandle<R>, payload: WindowStatePayload) {
    let _ = app.emit(WINDOW_STATE_EVENT, payload);
}

#[cfg(desktop)]
fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        app.state::<AppLifecycleState>()
            .is_hidden
            .store(false, Ordering::SeqCst);
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        emit_window_state(app, read_window_state(&window));
    }
}

#[cfg(desktop)]
fn hide_window<R: Runtime>(window: &WebviewWindow<R>) {
    window
        .state::<AppLifecycleState>()
        .is_hidden
        .store(true, Ordering::SeqCst);
    emit_window_state(
        &window.app_handle(),
        WindowStatePayload {
            label: window.label().to_string(),
            focused: false,
            minimized: false,
            visible: false,
        },
    );
    let _ = window.hide();
}

#[cfg(desktop)]
fn read_window_state<R: Runtime>(window: &WebviewWindow<R>) -> WindowStatePayload {
    let mut visible = window.is_visible().unwrap_or(false);
    let mut minimized = window.is_minimized().unwrap_or(true);
    let mut focused = window.is_focused().unwrap_or(false);
    #[cfg(windows)]
    if let Ok(handle) = window.hwnd() {
        use windows::Win32::{
            Foundation::HWND,
            UI::WindowsAndMessaging::{GetForegroundWindow, IsIconic, IsWindowVisible},
        };
        let handle = HWND(handle.0);
        // WebView2 может сохранять старый focus при сворачивании или фокусе второго окна.
        unsafe {
            visible = IsWindowVisible(handle).as_bool();
            minimized = IsIconic(handle).as_bool();
            focused = GetForegroundWindow() == handle;
        }
    }
    WindowStatePayload {
        label: window.label().to_string(),
        focused: visible && !minimized && focused,
        minimized,
        visible,
    }
}

#[cfg(desktop)]
#[tauri::command]
fn desktop_window_state<R: Runtime>(
    window: WebviewWindow<R>,
    label: Option<String>,
) -> Result<WindowStatePayload, String> {
    let label = label.as_deref().unwrap_or(window.label());
    if !matches!(label, "main" | "call") {
        return Err("Неизвестное окно чата".into());
    }
    let target = window
        .app_handle()
        .get_webview_window(label)
        .ok_or("Окно чата закрыто")?;
    Ok(read_window_state(&target))
}

#[cfg(desktop)]
#[tauri::command]
fn desktop_get_open_urls<R: Runtime>(app: AppHandle<R>) -> Result<Option<Vec<String>>, String> {
    app.deep_link()
        .get_current()
        .map(|urls| urls.map(|urls| urls.into_iter().map(|url| url.to_string()).collect()))
        .map_err(|error| error.to_string())
}

#[cfg(desktop)]
#[tauri::command]
fn desktop_restart<R: Runtime>(app: AppHandle<R>) {
    app.state::<AppLifecycleState>()
        .is_quitting
        .store(true, Ordering::SeqCst);
    app.request_restart();
}

#[cfg(desktop)]
fn launched_from_autostart() -> bool {
    std::env::args().any(|arg| arg == AUTOSTART_ARG)
}

#[cfg(desktop)]
fn store_pending_notification_target<R: Runtime>(app: &AppHandle<R>, payload: String) {
    if let Ok(mut pending_target) = app.state::<PendingNotificationTarget>().0.lock() {
        *pending_target = Some(payload);
    }
}

#[cfg(desktop)]
fn handle_notification_activation<R: Runtime>(app: &AppHandle<R>, payload: String) {
    store_pending_notification_target(app, payload.clone());
    if desktop_notifications::activation_needs_window(&payload) {
        show_main_window(app);
    }
    let _ = app.emit(NOTIFICATION_CLICK_EVENT, payload);
}

#[cfg(windows)]
fn get_toast_activated_arguments(insp: &Option<IInspectable>) -> Option<String> {
    let args = insp
        .as_ref()
        .and_then(|value| value.cast::<ToastActivatedEventArgs>().ok())?;
    let payload = args.Arguments().ok()?;

    if payload.is_empty() {
        None
    } else {
        let text = args
            .UserInput()
            .ok()
            .and_then(|input| input.Lookup(&HSTRING::from("reply_text")).ok())
            .and_then(|value| value.cast::<IPropertyValue>().ok())
            .and_then(|value| value.GetString().ok())
            .map(|value| value.to_string());
        Some(desktop_notifications::with_reply_input(
            &payload.to_string(),
            text.as_deref(),
        ))
    }
}

#[cfg(windows)]
fn windows_topic_notification_tags(topic_id: &str) -> [String; 2] {
    [
        format!("sep-chat-message-{topic_id}"),
        format!("sep-chat-call-{topic_id}"),
    ]
}

#[cfg(windows)]
#[tauri::command]
fn show_windows_notification<R: Runtime>(
    app: AppHandle<R>,
    title: String,
    body: Option<String>,
    payload: String,
    tag: Option<String>,
    group: Option<String>,
) -> Result<bool, String> {
    let payload_for_handler = payload.clone();
    let app_for_handler = app.clone();
    let toast_xml = XmlDocument::new().map_err(|error| error.to_string())?;

    toast_xml
        .LoadXml(&HSTRING::from(desktop_notifications::build_toast_xml(
            &title,
            body.as_deref(),
            &payload,
        )))
        .map_err(|error| error.to_string())?;

    let toast = ToastNotification::CreateToastNotification(&toast_xml)
        .map_err(|error| error.to_string())?;

    if let Some(tag_value) = tag.filter(|value| !value.trim().is_empty()) {
        toast
            .SetTag(&HSTRING::from(tag_value))
            .map_err(|error| error.to_string())?;
    }

    if let Some(group_value) = group.filter(|value| !value.trim().is_empty()) {
        toast
            .SetGroup(&HSTRING::from(group_value))
            .map_err(|error| error.to_string())?;
    }

    toast
        .Activated(&TypedEventHandler::new(move |_, insp| {
            let target_payload = get_toast_activated_arguments(&insp)
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| payload_for_handler.clone());
            handle_notification_activation(&app_for_handler, target_payload);
            Ok(())
        }))
        .map_err(|error| error.to_string())?;

    let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(
        app.config().identifier.clone(),
    ))
    .map_err(|error| error.to_string())?;
    notifier.Show(&toast).map_err(|error| error.to_string())?;

    Ok(true)
}

#[tauri::command]
fn desktop_notification_permission<R: Runtime>(app: AppHandle<R>) -> Result<Option<bool>, String> {
    #[cfg(windows)]
    {
        let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(
            app.config().identifier.clone(),
        ))
        .map_err(|error| error.to_string())?;
        let setting = notifier.Setting().map_err(|error| error.to_string())?;
        Ok(Some(
            setting == windows::UI::Notifications::NotificationSetting::Enabled,
        ))
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Ok(None)
    }
}

#[cfg(not(windows))]
#[tauri::command]
fn show_windows_notification<R: Runtime>(
    _app: AppHandle<R>,
    _title: String,
    _body: Option<String>,
    _payload: String,
    _tag: Option<String>,
    _group: Option<String>,
) -> Result<bool, String> {
    Ok(false)
}

#[cfg(windows)]
#[tauri::command]
fn clear_windows_topic_notifications<R: Runtime>(
    app: AppHandle<R>,
    topic_id: String,
    messages_only: Option<bool>,
    calls_only: Option<bool>,
) -> Result<bool, String> {
    if topic_id.trim().is_empty() {
        return Ok(false);
    }

    let app_id = HSTRING::from(app.config().identifier.clone());
    let group = HSTRING::from(topic_id.clone());
    let history = ToastNotificationManager::History().map_err(|error| error.to_string())?;

    let tags = windows_topic_notification_tags(&topic_id);
    let count = if messages_only.unwrap_or(false) { 1 } else { 2 };
    for tag in tags
        .iter()
        .skip(if calls_only.unwrap_or(false) { 1 } else { 0 })
        .take(count)
    {
        history
            .RemoveGroupedTagWithId(&HSTRING::from(tag), &group, &app_id)
            .map_err(|error| error.to_string())?;
    }

    Ok(true)
}

#[cfg(not(windows))]
#[tauri::command]
fn clear_windows_topic_notifications<R: Runtime>(
    _app: AppHandle<R>,
    _topic_id: String,
    _messages_only: Option<bool>,
    _calls_only: Option<bool>,
) -> Result<bool, String> {
    Ok(false)
}

#[cfg(windows)]
#[tauri::command]
fn clear_all_windows_notifications<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    ToastNotificationManager::History()
        .and_then(|history| history.ClearWithId(&HSTRING::from(app.config().identifier.clone())))
        .map_err(|error| error.to_string())?;
    Ok(true)
}

#[cfg(not(windows))]
#[tauri::command]
fn clear_all_windows_notifications<R: Runtime>(_app: AppHandle<R>) -> Result<bool, String> {
    Ok(false)
}

#[cfg(desktop)]
#[tauri::command]
fn consume_pending_notification_target(
    pending_target: State<'_, PendingNotificationTarget>,
) -> Option<String> {
    pending_target.0.lock().ok()?.take()
}

#[cfg(not(desktop))]
#[tauri::command]
fn consume_pending_notification_target() -> Option<String> {
    None
}

#[cfg(windows)]
#[tauri::command]
fn get_vpn_status() -> Result<VpnStatusPayload, String> {
    let adapter_names = desktop_vpn::adapter_names()?;

    Ok(VpnStatusPayload {
        is_active: !adapter_names.is_empty(),
        adapter_names,
    })
}

#[cfg(windows)]
#[tauri::command]
fn open_vpn_settings() -> Result<bool, String> {
    Command::new("explorer.exe")
        .arg("ms-settings:network-vpn")
        .spawn()
        .map_err(|error| error.to_string())?;

    Ok(true)
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn open_vpn_settings() -> Result<bool, String> {
    Command::new("open")
        .arg("x-apple.systempreferences:com.apple.Network-Settings.extension")
        .spawn()
        .map_err(|error| error.to_string())?;

    Ok(true)
}

#[cfg(all(not(windows), not(target_os = "macos")))]
#[tauri::command]
fn open_vpn_settings() -> Result<bool, String> {
    Command::new("sh")
        .args(["-c", "gnome-control-center network || xdg-open ."])
        .spawn()
        .map_err(|error| error.to_string())?;

    Ok(true)
}

#[cfg(not(windows))]
#[tauri::command]
fn get_vpn_status() -> Result<VpnStatusPayload, String> {
    Ok(VpnStatusPayload {
        is_active: false,
        adapter_names: Vec::new(),
    })
}

#[cfg(desktop)]
fn setup_desktop<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    app.handle().plugin(tauri_plugin_autostart::init(
        MacosLauncher::LaunchAgent,
        Some(vec![AUTOSTART_ARG]),
    ))?;

    // Dev-сборка не должна заменять установленный exe в автозапуске.
    if !cfg!(debug_assertions) {
        #[cfg(windows)]
        if let Err(error) = desktop_autostart::register(&app.config().identifier) {
            eprintln!("Не удалось обновить автозапуск СЭП Чат: {error}");
        }
        #[cfg(not(windows))]
        if let Err(error) = app.autolaunch().enable() {
            eprintln!("Не удалось обновить автозапуск СЭП Чат: {error}");
        }
    }

    let call_controls = desktop_call_controls::setup(app)?;
    let tray_menu = MenuBuilder::new(app)
        .text(TRAY_SHOW_ID, "Открыть СЭП Чат")
        .text(TRAY_MINIMIZE_ID, "Свернуть")
        .separator()
        .item(&call_controls[0])
        .item(&call_controls[1])
        .item(&call_controls[2])
        .separator()
        .text(TRAY_INSPECT_ID, "Открыть инспектор")
        .separator()
        .text(TRAY_QUIT_ID, "Выйти")
        .build()?;

    let mut tray_builder = TrayIconBuilder::with_id("sep-chat-tray")
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            TRAY_SHOW_ID => {
                app.state::<AppLifecycleState>()
                    .is_quitting
                    .store(false, Ordering::SeqCst);
                show_main_window(app);
            }
            TRAY_MINIMIZE_ID => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.minimize();
                }
            }
            TRAY_INSPECT_ID => {
                show_main_window(app);
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            TRAY_QUIT_ID => {
                app.state::<AppLifecycleState>()
                    .is_quitting
                    .store(true, Ordering::SeqCst);
                app.exit(0);
            }
            id => {
                desktop_call_controls::handle_action(app, id);
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                tray.app_handle()
                    .state::<AppLifecycleState>()
                    .is_quitting
                    .store(false, Ordering::SeqCst);
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    let _tray = tray_builder.build(app)?;

    if launched_from_autostart() {
        if let Some(window) = app.get_webview_window("main") {
            hide_window(&window);
        }
    }

    Ok(())
}

#[tauri::command]
fn get_telemetry_os() -> &'static str {
    std::env::consts::OS
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder
        .manage(std::sync::Arc::new(
            desktop_agent::DesktopAgentState::default(),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(desktop_media_permissions::DesktopMediaPermissions::default())
        .manage(desktop_permission_preferences::DesktopPermissionPreferences::default())
        .manage(desktop_screen_capture::DesktopScreenCapture::default())
        .manage(desktop_call_window::DesktopCallWindow::default())
        .on_permission_request(desktop_media_permissions::handle_request);
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            if !args.iter().any(|arg| arg == AUTOSTART_ARG) {
                show_main_window(app);
            }
        }))
        .plugin(tauri_plugin_deep_link::init());

    builder
        .on_page_load(|webview, payload| {
            #[cfg(desktop)]
            if webview.label() == "main"
                && matches!(payload.event(), tauri::webview::PageLoadEvent::Started)
            {
                let _ = desktop_call_window::close_call_window(webview.app_handle());
                webview
                    .state::<desktop_screen_capture::DesktopScreenCapture>()
                    .stop_all();
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .manage({
            #[cfg(desktop)]
            {
                AppLifecycleState::default()
            }
            #[cfg(not(desktop))]
            {
                ()
            }
        })
        .manage({
            #[cfg(desktop)]
            {
                PendingNotificationTarget::default()
            }
            #[cfg(not(desktop))]
            {
                ()
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_telemetry_os,
            desktop_window_state,
            desktop_call_controls::desktop_sync_call_controls,
            desktop_call_window::desktop_call_window_available,
            desktop_call_window::desktop_close_call_window,
            desktop_get_open_urls,
            desktop_restart,
            desktop_media_permissions::desktop_media_permissions_available,
            desktop_media_permissions::desktop_grant_media_permissions,
            desktop_media_permissions::desktop_grant_permissions,
            desktop_permission_preferences::desktop_load_permission_preferences,
            desktop_permission_preferences::desktop_save_permission_choice,
            desktop_permission_preferences::desktop_reset_permission_preferences,
            desktop_screen_capture::desktop_screen_capture_available,
            desktop_screen_capture::desktop_screen_capture_active,
            desktop_screen_capture::desktop_screen_capture_permission,
            desktop_screen_capture::desktop_screen_capture_sources,
            desktop_screen_capture::desktop_screen_capture_start,
            desktop_screen_capture::desktop_screen_capture_stop,
            desktop_screen_capture::desktop_screen_capture_ack,
            #[cfg(desktop)]
            desktop_agent::desktop_agent_models,
            #[cfg(desktop)]
            desktop_agent::desktop_agent_translate_notes,
            #[cfg(desktop)]
            desktop_agent::desktop_agent_pick_directory,
            #[cfg(desktop)]
            desktop_agent::desktop_agent_resume_directory,
            #[cfg(desktop)]
            desktop_agent::desktop_agent_configure,
            #[cfg(desktop)]
            desktop_agent::desktop_agent_prompt,
            #[cfg(desktop)]
            desktop_agent::desktop_agent_read_image,
            #[cfg(desktop)]
            desktop_agent::desktop_agent_read_output,
            #[cfg(desktop)]
            desktop_agent::desktop_agent_cancel,
            #[cfg(desktop)]
            desktop_agent::desktop_agent_answer_permission,
            #[cfg(desktop)]
            desktop_agent::desktop_agent_disconnect,
            #[cfg(desktop)]
            desktop_agent::desktop_agent_reset,
            show_windows_notification,
            desktop_notification_permission,
            clear_windows_topic_notifications,
            clear_all_windows_notifications,
            consume_pending_notification_target,
            desktop_files::read_dropped_file,
            desktop_files::desktop_file_read_info,
            desktop_files::desktop_file_pick,
            desktop_files::desktop_file_register_source,
            desktop_files::desktop_file_status,
            desktop_files::desktop_file_download,
            desktop_files::desktop_file_cancel_download,
            desktop_files::desktop_file_save,
            desktop_files::desktop_file_open,
            desktop_files::desktop_update_prepare,
            desktop_auth::desktop_auth_request,
            #[cfg(windows)]
            desktop_recovery::desktop_restore_recovery,
            #[cfg(windows)]
            desktop_recovery::desktop_save_recovery,
            get_vpn_status,
            open_vpn_settings
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                desktop_call_window::create_main_window(app)?;
                setup_desktop(app)?;
                let app_handle = app.handle().clone();
                app.deep_link()
                    .on_open_url(move |_| show_main_window(&app_handle));
                #[cfg(any(windows, target_os = "linux"))]
                if !cfg!(debug_assertions) {
                    if let Err(error) = app.deep_link().register_all() {
                        eprintln!("Не удалось зарегистрировать ссылки СЭП Чат: {error}");
                    }
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(desktop)]
            if matches!(event, WindowEvent::Focused(_) | WindowEvent::Resized(_)) {
                if let Some(webview) = window.app_handle().get_webview_window(window.label()) {
                    emit_window_state(window.app_handle(), read_window_state(&webview));
                }
            }
            #[cfg(desktop)]
            if window.label() == desktop_call_window::CALL_WINDOW_LABEL {
                // У окна звонка свой onCloseRequested; оно не прячет главное окно.
                return;
            }
            #[cfg(desktop)]
            if let WindowEvent::CloseRequested { api, .. } = event {
                let is_quitting = window
                    .state::<AppLifecycleState>()
                    .is_quitting
                    .load(Ordering::SeqCst);

                if !is_quitting {
                    api.prevent_close();

                    if let Some(webview_window) = window.app_handle().get_webview_window("main") {
                        hide_window(&webview_window);
                    }
                }
            }
        })
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .build(tauri::generate_context!())
        .expect("Не удалось создать приложение Tauri")
        .run(|_app, _event| {
            #[cfg(target_os = "macos")]
            if matches!(_event, tauri::RunEvent::Reopen { .. }) {
                show_main_window(_app);
            }
        });
}
