use super::{rgba_packet, CaptureSource};
use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tauri::ipc::{Channel, Response};
use windows_capture::{
    capture::{Context, GraphicsCaptureApiHandler},
    frame::Frame,
    graphics_capture_api::InternalCaptureControl,
    monitor::Monitor,
    settings::{
        ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
        MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
    },
    window::Window,
};

fn monitor_id(monitor: &Monitor) -> String {
    format!("screen:{}", monitor.as_raw_hmonitor() as usize)
}
fn window_id(window: &Window) -> String {
    format!("window:{}", window.as_raw_hwnd() as usize)
}

pub fn sources() -> Result<Vec<CaptureSource>, String> {
    let mut sources = Vec::new();
    for (index, monitor) in Monitor::enumerate()
        .map_err(|error| error.to_string())?
        .into_iter()
        .enumerate()
    {
        sources.push(CaptureSource {
            id: monitor_id(&monitor),
            name: format!("Экран {}", index + 1),
            kind: "screen",
        });
    }
    for window in Window::enumerate().map_err(|error| error.to_string())? {
        let name = window.title().unwrap_or_default();
        if !name.trim().is_empty() {
            sources.push(CaptureSource {
                id: window_id(&window),
                name,
                kind: "window",
            });
        }
    }
    Ok(sources)
}

struct CaptureFlags {
    stopped: Arc<AtomicBool>,
    pending: Arc<AtomicBool>,
    channel: Channel<Response>,
    started_at: Instant,
    sent_at: Arc<AtomicU64>,
}

struct CaptureHandler {
    flags: CaptureFlags,
    last_frame: Option<Instant>,
}

impl GraphicsCaptureApiHandler for CaptureHandler {
    type Flags = CaptureFlags;
    type Error = Box<dyn std::error::Error + Send + Sync>;
    fn new(context: Context<Self::Flags>) -> Result<Self, Self::Error> {
        Ok(Self {
            flags: context.flags,
            last_frame: None,
        })
    }
    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame,
        control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        if self.flags.stopped.load(Ordering::SeqCst) {
            control.stop();
            return Ok(());
        }
        if self.flags.pending.load(Ordering::SeqCst)
            || self
                .last_frame
                .is_some_and(|at| at.elapsed() < Duration::from_millis(33))
        {
            return Ok(());
        }
        let width = frame.width() as i32;
        let height = frame.height() as i32;
        let mut buffer = frame.buffer()?;
        let bytes =
            rgba_packet(width, height, buffer.as_raw_buffer()).map_err(std::io::Error::other)?;
        self.flags.pending.store(true, Ordering::SeqCst);
        self.flags.sent_at.store(
            self.flags.started_at.elapsed().as_millis() as u64,
            Ordering::SeqCst,
        );
        self.last_frame = Some(Instant::now());
        if self.flags.channel.send(Response::new(bytes)).is_err() {
            self.flags.stopped.store(true, Ordering::SeqCst);
            control.stop();
        }
        Ok(())
    }
    fn on_closed(&mut self) -> Result<(), Self::Error> {
        self.flags.stopped.store(true, Ordering::SeqCst);
        Ok(())
    }
}

pub fn capture(
    source_id: &str,
    stopped: Arc<AtomicBool>,
    pending: Arc<AtomicBool>,
    channel: Channel<Response>,
) -> Result<(), String> {
    let started_at = Instant::now();
    let sent_at = Arc::new(AtomicU64::new(0));
    let flags = CaptureFlags {
        stopped: stopped.clone(),
        pending: pending.clone(),
        channel,
        started_at,
        sent_at: sent_at.clone(),
    };
    macro_rules! start {
        ($target:expr) => {
            CaptureHandler::start_free_threaded(Settings::new(
                $target,
                CursorCaptureSettings::Default,
                DrawBorderSettings::Default,
                SecondaryWindowSettings::Default,
                MinimumUpdateIntervalSettings::Default,
                DirtyRegionSettings::Default,
                ColorFormat::Bgra8,
                flags,
            ))
            .map_err(|error| error.to_string())?
        };
    }
    let control = if source_id.starts_with("screen:") {
        let target = Monitor::enumerate()
            .map_err(|error| error.to_string())?
            .into_iter()
            .find(|target| monitor_id(target) == source_id)
            .ok_or("Выбранный экран больше недоступен")?;
        start!(target)
    } else {
        let target = Window::enumerate()
            .map_err(|error| error.to_string())?
            .into_iter()
            .find(|target| window_id(target) == source_id)
            .ok_or("Выбранное окно больше недоступно")?;
        start!(target)
    };
    let mut stalled = false;
    while !stopped.load(Ordering::SeqCst) && !control.is_finished() {
        if pending.load(Ordering::SeqCst)
            && started_at.elapsed().as_millis() as u64 > sent_at.load(Ordering::SeqCst) + 30_000
        {
            stalled = true;
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    control.stop().map_err(|error| error.to_string())?;
    if stalled {
        Err("Окно приложения перестало принимать кадры демонстрации".into())
    } else {
        Ok(())
    }
}
