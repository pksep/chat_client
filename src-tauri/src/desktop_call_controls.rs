use serde::Deserialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{image::Image, menu::IconMenuItem, App, AppHandle, Emitter, Manager, Runtime};

const IDS: [&str; 3] = [
    "tray-call-microphone",
    "tray-call-camera",
    "tray-call-screen",
];
const DEVICES: [&str; 3] = ["microphone", "camera", "screen"];
const ICONS: [[&[u8]; 2]; 3] = [
    [
        include_bytes!("../icons/call-controls/microphone-off.png"),
        include_bytes!("../icons/call-controls/microphone-on.png"),
    ],
    [
        include_bytes!("../icons/call-controls/camera-off.png"),
        include_bytes!("../icons/call-controls/camera-on.png"),
    ],
    [
        include_bytes!("../icons/call-controls/screen-off.png"),
        include_bytes!("../icons/call-controls/screen-on.png"),
    ],
];

struct DesktopCallControls<R: Runtime> {
    items: [IconMenuItem<R>; 3],
    enabled: AtomicBool,
}

#[derive(Deserialize)]
pub struct CallControlsSnapshot {
    enabled: bool,
    microphone: bool,
    camera: bool,
    screen: bool,
}

fn text(index: usize, active: bool) -> String {
    let (label, status) = match index {
        0 => (
            "Микрофон",
            if active {
                "включён"
            } else {
                "выключен"
            },
        ),
        1 => (
            "Камера",
            if active {
                "включена"
            } else {
                "выключена"
            },
        ),
        _ => (
            "Демонстрация экрана",
            if active {
                "включена"
            } else {
                "выключена"
            },
        ),
    };
    format!("{label}: {status}")
}

pub fn setup<R: Runtime>(app: &App<R>) -> tauri::Result<[IconMenuItem<R>; 3]> {
    let create = |index: usize| {
        IconMenuItem::with_id(
            app,
            IDS[index],
            text(index, false),
            false,
            Some(Image::from_bytes(ICONS[index][0])?),
            None::<&str>,
        )
    };
    let items = [create(0)?, create(1)?, create(2)?];
    app.manage(DesktopCallControls {
        items: items.clone(),
        enabled: AtomicBool::new(false),
    });
    Ok(items)
}

pub fn handle_action<R: Runtime>(app: &AppHandle<R>, id: &str) -> bool {
    let Some(index) = IDS.iter().position(|candidate| *candidate == id) else {
        return false;
    };
    if app
        .state::<DesktopCallControls<R>>()
        .enabled
        .load(Ordering::SeqCst)
    {
        let _ = app.emit_to("main", "sep-chat://call-device-action", DEVICES[index]);
    }
    true
}

#[tauri::command]
pub fn desktop_sync_call_controls<R: Runtime>(
    window: tauri::WebviewWindow<R>,
    snapshot: CallControlsSnapshot,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Устройства звонка управляются основным окном".into());
    }
    let controls = window.state::<DesktopCallControls<R>>();
    controls.enabled.store(snapshot.enabled, Ordering::SeqCst);
    for (index, active) in [snapshot.microphone, snapshot.camera, snapshot.screen]
        .into_iter()
        .enumerate()
    {
        let item = &controls.items[index];
        item.set_text(text(index, active))
            .map_err(|error| error.to_string())?;
        item.set_icon(Some(
            Image::from_bytes(ICONS[index][usize::from(active)])
                .map_err(|error| error.to_string())?,
        ))
        .map_err(|error| error.to_string())?;
        item.set_enabled(snapshot.enabled)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}
