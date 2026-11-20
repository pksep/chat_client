use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};
use tauri::{
    ipc::{Channel, Response},
    Runtime, State, WebviewWindow,
};

#[derive(Default)]
pub struct DesktopScreenCapture(Mutex<Option<CaptureSession>>);

impl DesktopScreenCapture {
    pub fn stop_all(&self) {
        if let Ok(mut session) = self.0.lock() {
            if let Some(capture) = session.take() {
                capture.stopped.store(true, Ordering::SeqCst);
            }
        }
    }
}

#[tauri::command]
pub fn desktop_screen_capture_active(state: State<'_, DesktopScreenCapture>) -> bool {
    state.0.lock().ok().is_some_and(|session| {
        session
            .as_ref()
            .is_some_and(|capture| !capture.stopped.load(Ordering::SeqCst))
    })
}

#[cfg(windows)]
#[path = "desktop_screen_capture_windows.rs"]
mod windows_capture_backend;

#[cfg(target_os = "macos")]
#[path = "desktop_screen_capture_macos.rs"]
mod macos_capture_backend;

struct CaptureSession {
    id: String,
    stopped: Arc<AtomicBool>,
    frame_pending: Arc<AtomicBool>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureSource {
    id: String,
    name: String,
    kind: &'static str,
}

#[derive(Clone, Serialize)]
pub struct CaptureStatus {
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureAvailability {
    supported: bool,
    permission_granted: bool,
}

fn require_main<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("Захват экрана доступен только из основного окна".into())
    }
}

#[tauri::command]
pub fn desktop_screen_capture_available() -> CaptureAvailability {
    #[cfg(target_os = "macos")]
    {
        CaptureAvailability {
            supported: macos_capture_backend::supported(),
            permission_granted: macos_capture_backend::has_permission(),
        }
    }
    #[cfg(windows)]
    {
        CaptureAvailability {
            supported: windows_capture::graphics_capture_api::GraphicsCaptureApi::is_supported()
                .unwrap_or(false),
            permission_granted: true,
        }
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        CaptureAvailability {
            supported: false,
            permission_granted: false,
        }
    }
}

#[tauri::command]
pub async fn desktop_screen_capture_permission<R: Runtime>(
    window: WebviewWindow<R>,
) -> Result<bool, String> {
    require_main(&window)?;
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(macos_capture_backend::request_permission)
            .await
            .map_err(|error| error.to_string())
    }
    #[cfg(windows)]
    {
        Ok(true)
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        Ok(false)
    }
}

#[tauri::command]
pub async fn desktop_screen_capture_sources<R: Runtime>(
    window: WebviewWindow<R>,
) -> Result<Vec<CaptureSource>, String> {
    require_main(&window)?;
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(macos_capture_backend::sources)
            .await
            .map_err(|error| error.to_string())?
    }
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(windows_capture_backend::sources)
            .await
            .map_err(|error| error.to_string())?
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        Ok(Vec::new())
    }
}

#[tauri::command]
pub fn desktop_screen_capture_stop<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, DesktopScreenCapture>,
    session_id: String,
) -> Result<(), String> {
    require_main(&window)?;
    let mut session = state.0.lock().map_err(|error| error.to_string())?;
    if session
        .as_ref()
        .is_some_and(|capture| capture.id == session_id)
    {
        if let Some(capture) = session.take() {
            capture.stopped.store(true, Ordering::SeqCst);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn desktop_screen_capture_ack<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, DesktopScreenCapture>,
    session_id: String,
) -> Result<(), String> {
    require_main(&window)?;
    if let Some(capture) = state
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .as_ref()
        .filter(|capture| capture.id == session_id)
    {
        capture.frame_pending.store(false, Ordering::SeqCst);
    }
    Ok(())
}

#[tauri::command]
pub fn desktop_screen_capture_start<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, DesktopScreenCapture>,
    source_id: String,
    on_frame: Channel<Response>,
    on_status: Channel<CaptureStatus>,
) -> Result<String, String> {
    require_main(&window)?;
    #[cfg(any(windows, target_os = "macos"))]
    {
        static NEXT: AtomicU64 = AtomicU64::new(1);
        let id = NEXT.fetch_add(1, Ordering::SeqCst).to_string();
        let stopped = Arc::new(AtomicBool::new(false));
        let frame_pending = Arc::new(AtomicBool::new(false));
        let mut session = state.0.lock().map_err(|error| error.to_string())?;
        if let Some(previous) = session.take() {
            previous.stopped.store(true, Ordering::SeqCst);
        }
        *session = Some(CaptureSession {
            id: id.clone(),
            stopped: stopped.clone(),
            frame_pending: frame_pending.clone(),
        });
        std::thread::spawn(move || {
            let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                capture(&source_id, stopped, frame_pending, on_frame)
            }));
            let error = match outcome {
                Ok(Ok(())) => None,
                Ok(Err(error)) => Some(error),
                Err(_) => Some("Не удалось запустить захват выбранного источника".into()),
            };
            let _ = on_status.send(CaptureStatus { error });
        });
        Ok(id)
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = (state, source_id, on_frame, on_status);
        Err("Используйте системный выбор экрана на этой платформе".into())
    }
}

#[cfg(windows)]
fn capture(
    source_id: &str,
    stopped: Arc<AtomicBool>,
    frame_pending: Arc<AtomicBool>,
    on_frame: Channel<Response>,
) -> Result<(), String> {
    windows_capture_backend::capture(source_id, stopped, frame_pending, on_frame)
}

#[cfg(target_os = "macos")]
fn capture(
    source_id: &str,
    stopped: Arc<AtomicBool>,
    frame_pending: Arc<AtomicBool>,
    on_frame: Channel<Response>,
) -> Result<(), String> {
    macos_capture_backend::capture(source_id, stopped, frame_pending, on_frame)
}

#[cfg(any(windows, target_os = "macos"))]
fn rgba_packet(width: i32, height: i32, bgra: &[u8]) -> Result<Vec<u8>, String> {
    if width <= 0 || height <= 0 || width > 16384 || height > 16384 {
        return Err("Некорректный размер кадра".into());
    }
    let (width, height) = (width as usize, height as usize);
    let stride = bgra.len() / height;
    if stride < width * 4 || bgra.len() % height != 0 {
        return Err("Некорректные данные кадра".into());
    }
    let scale = (1920.0 / width as f64).min(1080.0 / height as f64).min(1.0);
    let output_width = ((width as f64 * scale) as usize).max(1);
    let output_height = ((height as f64 * scale) as usize).max(1);
    let mut bytes = Vec::with_capacity(8 + output_width * output_height * 4);
    bytes.extend_from_slice(&(output_width as u32).to_le_bytes());
    bytes.extend_from_slice(&(output_height as u32).to_le_bytes());
    for y in 0..output_height {
        let row = y * height / output_height * stride;
        for x in 0..output_width {
            let position = row + x * width / output_width * 4;
            bytes.extend_from_slice(&[bgra[position + 2], bgra[position + 1], bgra[position], 255]);
        }
    }
    Ok(bytes)
}

#[cfg(all(test, any(windows, target_os = "macos")))]
mod tests {
    use super::rgba_packet;

    #[test]
    fn native_bgra_and_padded_rows_become_canvas_rgba() {
        let packet = rgba_packet(
            1,
            2,
            &[10, 20, 30, 0, 99, 99, 99, 99, 40, 50, 60, 0, 88, 88, 88, 88],
        )
        .unwrap();
        assert_eq!(&packet[..8], &[1, 0, 0, 0, 2, 0, 0, 0]);
        assert_eq!(&packet[8..], &[30, 20, 10, 255, 60, 50, 40, 255]);
    }

    #[test]
    fn portrait_capture_keeps_aspect_ratio_and_bounds() {
        let packet = rgba_packet(1080, 1920, &vec![0; 1080 * 1920 * 4]).unwrap();
        let width = u32::from_le_bytes(packet[..4].try_into().unwrap());
        let height = u32::from_le_bytes(packet[4..8].try_into().unwrap());
        assert_eq!((width, height), (607, 1080));
        assert_eq!(packet.len(), 8 + 607 * 1080 * 4);
    }

    #[test]
    fn invalid_or_incomplete_capture_is_rejected() {
        assert!(rgba_packet(0, 1, &[]).is_err());
        assert!(rgba_packet(100, 100, &[0; 12]).is_err());
        assert!(rgba_packet(1, 3, &[0; 13]).is_err());
    }
}
