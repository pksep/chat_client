use serde::Deserialize;
use std::sync::atomic::{AtomicU8, Ordering};
use tauri::webview::{PermissionKind, PermissionResponse};
use tauri::{Manager, Runtime, State, Webview, WebviewWindow};

const MICROPHONE: u8 = 1;
const CAMERA: u8 = 2;
const GEOLOCATION: u8 = 4;
const CLIPBOARD_READ: u8 = 8;

#[derive(Default)]
pub struct DesktopMediaPermissions(AtomicU8);

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MediaPermission {
    Microphone,
    Camera,
    Geolocation,
    ClipboardRead,
}

#[tauri::command]
pub fn desktop_media_permissions_available() -> bool {
    true
}

#[tauri::command]
pub fn desktop_grant_media_permissions<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, DesktopMediaPermissions>,
    permissions: Vec<MediaPermission>,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Запрос доступа разрешён только из основного окна".into());
    }
    let mask = permissions.iter().fold(0, |mask, permission| {
        mask | match permission {
            MediaPermission::Microphone => MICROPHONE,
            MediaPermission::Camera => CAMERA,
            MediaPermission::Geolocation => GEOLOCATION,
            MediaPermission::ClipboardRead => CLIPBOARD_READ,
        }
    });
    state.0.fetch_or(mask, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn desktop_grant_permissions<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, DesktopMediaPermissions>,
    permissions: Vec<MediaPermission>,
) -> Result<(), String> {
    desktop_grant_media_permissions(window, state, permissions)
}

pub fn handle_request<R: Runtime>(webview: Webview<R>, kind: PermissionKind) -> PermissionResponse {
    if webview.label() != "main" {
        return PermissionResponse::Default;
    }
    let mask = match kind {
        PermissionKind::Microphone => MICROPHONE,
        PermissionKind::Camera => CAMERA,
        PermissionKind::Geolocation => GEOLOCATION,
        PermissionKind::ClipboardRead => CLIPBOARD_READ,
        _ => return PermissionResponse::Default,
    };
    let granted = webview
        .state::<DesktopMediaPermissions>()
        .0
        .load(Ordering::SeqCst);
    // Диалог SEP Chat уже получил выбор пользователя. Доступ самой ОС проверяет WebView.
    if granted & mask == mask {
        PermissionResponse::Allow
    } else {
        PermissionResponse::Default
    }
}
