use serde::Deserialize;
use std::sync::atomic::{AtomicU8, Ordering};
use tauri::webview::{PermissionKind, PermissionResponse};
use tauri::{Manager, Runtime, State, Webview, WebviewWindow};

const MICROPHONE: u8 = 1;
const CAMERA: u8 = 2;
const GEOLOCATION: u8 = 4;
const CLIPBOARD_READ: u8 = 8;

#[derive(Default)]
pub struct DesktopMediaPermissions {
    granted: AtomicU8,
    denied: AtomicU8,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MediaPermission {
    Microphone,
    Camera,
    Geolocation,
    ClipboardRead,
}

impl MediaPermission {
    fn mask(self) -> u8 {
        match self {
            Self::Microphone => MICROPHONE,
            Self::Camera => CAMERA,
            Self::Geolocation => GEOLOCATION,
            Self::ClipboardRead => CLIPBOARD_READ,
        }
    }
}

impl DesktopMediaPermissions {
    pub fn set_choice(&self, permission: MediaPermission, allowed: Option<bool>) {
        let mask = permission.mask();
        match allowed {
            Some(true) => {
                self.denied.fetch_and(!mask, Ordering::SeqCst);
                self.granted.fetch_or(mask, Ordering::SeqCst);
            }
            Some(false) => {
                self.denied.fetch_or(mask, Ordering::SeqCst);
                self.granted.fetch_and(!mask, Ordering::SeqCst);
            }
            None => {
                self.granted.fetch_and(!mask, Ordering::SeqCst);
                self.denied.fetch_and(!mask, Ordering::SeqCst);
            }
        }
    }

    pub fn response_for(&self, permission: MediaPermission) -> PermissionResponse {
        let mask = permission.mask();
        if self.denied.load(Ordering::SeqCst) & mask != 0 {
            PermissionResponse::Deny
        } else if self.granted.load(Ordering::SeqCst) & mask != 0 {
            PermissionResponse::Allow
        } else {
            PermissionResponse::Default
        }
    }
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
    for permission in permissions {
        // Старый запрос устройства не отменяет свежий запрет из настроек.
        if !matches!(state.response_for(permission), PermissionResponse::Deny) {
            state.set_choice(permission, Some(true));
        }
    }
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
    let permission = match kind {
        PermissionKind::Microphone => MediaPermission::Microphone,
        PermissionKind::Camera => MediaPermission::Camera,
        PermissionKind::Geolocation => MediaPermission::Geolocation,
        PermissionKind::ClipboardRead => MediaPermission::ClipboardRead,
        _ => return PermissionResponse::Default,
    };
    webview
        .state::<DesktopMediaPermissions>()
        .response_for(permission)
}
