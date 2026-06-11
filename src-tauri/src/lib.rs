use serde::Serialize;
use std::{path::Path, process::Command, time::UNIX_EPOCH};
use tauri::{Manager, WindowEvent};

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
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as AutostartExt};

#[cfg(windows)]
use windows::{
    core::{IInspectable, Interface, HSTRING},
    Data::Xml::Dom::XmlDocument,
    Foundation::TypedEventHandler,
    UI::Notifications::{ToastActivatedEventArgs, ToastNotification, ToastNotificationManager},
};

#[cfg(desktop)]
const AUTOSTART_ARG: &str = "--autostart";

#[cfg(desktop)]
const TRAY_SHOW_ID: &str = "tray-show";

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
}

#[cfg(desktop)]
#[derive(Default)]
struct PendingNotificationTarget(Mutex<Option<String>>);

#[cfg(desktop)]
#[derive(Clone, Copy, Serialize)]
struct WindowStatePayload {
    focused: bool,
    minimized: bool,
    visible: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DroppedFilePayload {
    name: String,
    mime_type: String,
    last_modified: Option<u128>,
    bytes: Vec<u8>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VpnStatusPayload {
    is_active: bool,
    adapter_names: Vec<String>,
}

#[cfg(windows)]
#[derive(serde::Deserialize)]
#[serde(rename_all = "PascalCase")]
struct WindowsNetworkAdapter {
    name: Option<String>,
    description: Option<String>,
    network_interface_type: Option<serde_json::Value>,
}

#[cfg(desktop)]
fn emit_window_state<R: Runtime>(app: &AppHandle<R>, payload: WindowStatePayload) {
    let _ = app.emit(WINDOW_STATE_EVENT, payload);
}

#[cfg(desktop)]
fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        emit_window_state(
            app,
            WindowStatePayload {
                focused: true,
                minimized: false,
                visible: true,
            },
        );
    }
}

#[cfg(desktop)]
fn hide_window<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.hide();
    emit_window_state(
        &window.app_handle(),
        WindowStatePayload {
            focused: false,
            minimized: false,
            visible: false,
        },
    );
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
    show_main_window(app);
    let _ = app.emit(NOTIFICATION_CLICK_EVENT, payload);
}

#[cfg(windows)]
fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(windows)]
fn get_toast_activated_arguments(insp: &Option<IInspectable>) -> Option<String> {
    let args = insp
        .as_ref()
        .and_then(|value| value.cast::<ToastActivatedEventArgs>().ok())?
        .Arguments()
        .ok()?;

    if args.is_empty() {
        None
    } else {
        Some(args.to_string())
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
    let escaped_title = escape_xml(&title);
    let escaped_body = body
        .filter(|value| !value.trim().is_empty())
        .map(|value| format!(r#"<text id="2">{}</text>"#, escape_xml(&value)))
        .unwrap_or_default();
    let escaped_payload = escape_xml(&payload);
    let toast_xml = XmlDocument::new().map_err(|error| error.to_string())?;

    toast_xml
        .LoadXml(&HSTRING::from(format!(
            r#"<toast duration="short" launch="{escaped_payload}">
                <visual>
                    <binding template="ToastGeneric">
                        <text id="1">{escaped_title}</text>
                        {escaped_body}
                    </binding>
                </visual>
            </toast>"#
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
) -> Result<bool, String> {
    if topic_id.trim().is_empty() {
        return Ok(false);
    }

    let app_id = HSTRING::from(app.config().identifier.clone());
    let group = HSTRING::from(topic_id.clone());
    let history = ToastNotificationManager::History().map_err(|error| error.to_string())?;

    for tag in windows_topic_notification_tags(&topic_id) {
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
) -> Result<bool, String> {
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

fn guess_mime_type(path: &Path) -> String {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    match extension.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "heic" => "image/heic",
        "heif" => "image/heif",
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        "avi" => "video/x-msvideo",
        "mkv" => "video/x-matroska",
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        "csv" => "text/csv",
        "json" => "application/json",
        "zip" => "application/zip",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        _ => "",
    }
    .to_string()
}

#[tauri::command]
fn read_dropped_file(path: String) -> Result<DroppedFilePayload, String> {
    let file_path = Path::new(&path);
    let metadata = std::fs::metadata(file_path).map_err(|error| error.to_string())?;

    if !metadata.is_file() {
        return Err("Dropped path is not a file".to_string());
    }

    let bytes = std::fs::read(file_path).map_err(|error| error.to_string())?;
    let name = file_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("dropped-file")
        .to_string();
    let last_modified = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis());

    Ok(DroppedFilePayload {
        name,
        mime_type: guess_mime_type(file_path),
        last_modified,
        bytes,
    })
}

#[cfg(windows)]
fn adapter_interface_type_matches_vpn(interface_type: &Option<serde_json::Value>) -> bool {
    match interface_type {
        Some(serde_json::Value::Number(value)) => value
            .as_u64()
            .map(|number| number == 23 || number == 131)
            .unwrap_or(false),
        Some(serde_json::Value::String(value)) => {
            let normalized = value.to_ascii_lowercase();
            normalized.contains("ppp") || normalized.contains("tunnel")
        }
        _ => false,
    }
}

#[cfg(windows)]
fn adapter_text_matches_vpn(adapter: &WindowsNetworkAdapter) -> bool {
    const VPN_MARKERS: &[&str] = &[
        "vpn",
        "wireguard",
        "openvpn",
        "tailscale",
        "zerotier",
        "anyconnect",
        "fortinet",
        "forticlient",
        "globalprotect",
        "nordvpn",
        "protonvpn",
        "surfshark",
        "expressvpn",
        "outline",
        "cloudflare warp",
        "warp",
        "checkpoint",
        "watchguard",
        "softether",
        "l2tp",
        "pptp",
        "sstp",
        "ikev2",
        "tun",
        "tap",
    ];

    let searchable = format!(
        "{} {}",
        adapter.name.as_deref().unwrap_or_default(),
        adapter.description.as_deref().unwrap_or_default()
    )
    .to_ascii_lowercase();

    VPN_MARKERS.iter().any(|marker| searchable.contains(marker))
}

#[cfg(windows)]
fn parse_windows_network_adapters(output: &str) -> Vec<WindowsNetworkAdapter> {
    let trimmed = output.trim();

    if trimmed.is_empty() {
        return Vec::new();
    }

    if let Ok(adapters) = serde_json::from_str::<Vec<WindowsNetworkAdapter>>(trimmed) {
        return adapters;
    }

    serde_json::from_str::<WindowsNetworkAdapter>(trimmed)
        .map(|adapter| vec![adapter])
        .unwrap_or_default()
}

#[cfg(windows)]
#[tauri::command]
fn get_vpn_status() -> Result<VpnStatusPayload, String> {
    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "[System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() | Where-Object { $_.OperationalStatus -eq 'Up' } | Select-Object Name,Description,NetworkInterfaceType | ConvertTo-Json -Compress",
        ])
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let adapter_names = parse_windows_network_adapters(&stdout)
        .into_iter()
        .filter(|adapter| {
            adapter_interface_type_matches_vpn(&adapter.network_interface_type)
                || adapter_text_matches_vpn(adapter)
        })
        .map(|adapter| {
            adapter
                .name
                .or(adapter.description)
                .unwrap_or_else(|| "VPN".to_string())
        })
        .collect::<Vec<_>>();

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

    let autostart_manager = app.autolaunch();
    let _ = autostart_manager.enable();

    let tray_menu = MenuBuilder::new(app)
        .text(TRAY_SHOW_ID, "Open SEP Chat")
        .separator()
        .text(TRAY_QUIT_ID, "Quit")
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
            TRAY_QUIT_ID => {
                app.state::<AppLifecycleState>()
                    .is_quitting
                    .store(true, Ordering::SeqCst);
                app.exit(0);
            }
            _ => {}
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            show_windows_notification,
            clear_windows_topic_notifications,
            consume_pending_notification_target,
            read_dropped_file,
            get_vpn_status,
            open_vpn_settings
        ])
        .setup(|app| {
            #[cfg(desktop)]
            setup_desktop(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
