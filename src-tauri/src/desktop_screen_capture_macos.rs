use super::{rgba_packet, CaptureSource};
use cidre::sc::{StreamDelegate, StreamDelegateImpl, StreamOutput, StreamOutputImpl};
use cidre::{arc, cm, cv, define_obj_type, dispatch, ns, objc, sc};
use futures::executor::block_on;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{sync_channel, SyncSender},
        Arc,
    },
    time::{Duration, Instant},
};
use tauri::ipc::{Channel, Response};

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}
#[link(name = "CoreVideo", kind = "framework")]
unsafe extern "C" {
    fn CVPixelBufferGetBaseAddress(buffer: &cv::PixelBuf) -> *const u8;
    fn CVPixelBufferGetBytesPerRow(buffer: &cv::PixelBuf) -> usize;
}

pub fn supported() -> bool {
    let version = ns::ProcessInfo::current().os_version();
    version.major > 12 || (version.major == 12 && version.minor >= 3)
}
pub fn has_permission() -> bool {
    supported() && unsafe { CGPreflightScreenCaptureAccess() }
}
pub fn request_permission() -> bool {
    supported() && unsafe { CGRequestScreenCaptureAccess() }
}

fn content() -> Result<arc::R<sc::ShareableContent>, String> {
    if !has_permission() {
        return Err("Разрешите запись экрана в настройках системы".into());
    }
    block_on(sc::ShareableContent::current()).map_err(|error| error.to_string())
}

pub fn sources() -> Result<Vec<CaptureSource>, String> {
    objc::ar_pool(|| {
        let content = content()?;
        let mut sources = Vec::new();
        for (index, display) in content.displays().iter().enumerate() {
            sources.push(CaptureSource {
                id: format!("screen:{}", display.display_id().0),
                name: format!("Экран {}", index + 1),
                kind: "screen",
            });
        }
        for window in content.windows().iter() {
            if !window.is_on_screen()
                || window.window_layer() != 0
                || window
                    .owning_app()
                    .is_some_and(|app| app.process_id() == std::process::id() as i32)
            {
                continue;
            }
            let Some(title) = window.title() else {
                continue;
            };
            let name = title.to_string();
            if !name.trim().is_empty() {
                sources.push(CaptureSource {
                    id: format!("window:{}", window.id()),
                    name,
                    kind: "window",
                });
            }
        }
        Ok(sources)
    })
}

struct OutputState {
    frames: SyncSender<arc::R<cm::SampleBuf>>,
}
define_obj_type!(
    SepCaptureOutput + StreamOutputImpl,
    OutputState,
    SEP_CAPTURE_OUTPUT
);
impl sc::stream::Output for SepCaptureOutput {}
#[objc::add_methods]
impl sc::stream::OutputImpl for SepCaptureOutput {
    extern "C" fn impl_stream_did_output_sample_buf(
        &mut self,
        _cmd: Option<&objc::Sel>,
        _stream: &sc::Stream,
        sample: &mut cm::SampleBuf,
        kind: sc::OutputType,
    ) {
        if kind == sc::OutputType::Screen {
            let _ = self.inner_mut().frames.try_send(sample.retained());
        }
    }
}

struct DelegateState {
    stopped: Arc<AtomicBool>,
}
define_obj_type!(
    SepCaptureDelegate + StreamDelegateImpl,
    DelegateState,
    SEP_CAPTURE_DELEGATE
);
impl sc::stream::Delegate for SepCaptureDelegate {}
#[objc::add_methods]
impl sc::stream::DelegateImpl for SepCaptureDelegate {
    extern "C" fn impl_stream_did_stop_with_err(
        &mut self,
        _cmd: Option<&objc::Sel>,
        _stream: &sc::Stream,
        _error: &ns::Error,
    ) {
        self.inner_mut().stopped.store(true, Ordering::SeqCst);
    }
}

pub fn capture(
    source_id: &str,
    stopped: Arc<AtomicBool>,
    pending: Arc<AtomicBool>,
    on_frame: Channel<Response>,
) -> Result<(), String> {
    objc::ar_pool(|| capture_inner(source_id, stopped, pending, on_frame))
}

fn capture_inner(
    source_id: &str,
    stopped: Arc<AtomicBool>,
    pending: Arc<AtomicBool>,
    on_frame: Channel<Response>,
) -> Result<(), String> {
    let content = content()?;
    let (filter, width, height) = if source_id.starts_with("screen:") {
        let displays = content.displays();
        let display = displays
            .iter()
            .find(|display| format!("screen:{}", display.display_id().0) == source_id)
            .ok_or("Выбранный экран больше недоступен")?;
        (
            sc::ContentFilter::with_display_excluding_windows(display, &ns::Array::new()),
            display.width() as f64,
            display.height() as f64,
        )
    } else {
        let windows = content.windows();
        let window = windows
            .iter()
            .find(|window| format!("window:{}", window.id()) == source_id)
            .ok_or("Выбранное окно больше недоступно")?;
        let size = window.frame().size;
        (
            sc::ContentFilter::with_desktop_independent_window(window),
            size.width * 2.0,
            size.height * 2.0,
        )
    };
    if width <= 0.0 || height <= 0.0 {
        return Err("Не удалось определить размер источника".into());
    }
    let scale = (1920.0 / width).min(1080.0 / height).min(1.0);
    let mut config = sc::StreamCfg::new();
    config.set_width(((width * scale) as usize).max(2) / 2 * 2);
    config.set_height(((height * scale) as usize).max(2) / 2 * 2);
    config.set_pixel_format(cv::PixelFormat::_32_BGRA);
    config.set_shows_cursor(true);
    config.set_minimum_frame_interval(cm::Time {
        value: 1,
        scale: 30,
        epoch: 0,
        flags: cm::TimeFlags::VALID,
    });
    let delegate = SepCaptureDelegate::with(DelegateState {
        stopped: stopped.clone(),
    });
    let stream = sc::Stream::with_delegate(&filter, &config, delegate.as_ref());
    let (tx, rx) = sync_channel(1);
    let output = SepCaptureOutput::with(OutputState { frames: tx });
    let queue = dispatch::Queue::serial_with_ar_pool();
    stream
        .add_stream_output(output.as_ref(), sc::OutputType::Screen, Some(&queue))
        .map_err(|error| error.to_string())?;
    block_on(stream.start()).map_err(|error| error.to_string())?;
    struct Guard(arc::R<sc::Stream>);
    impl Drop for Guard {
        fn drop(&mut self) {
            let _ = block_on(self.0.stop());
        }
    }
    let _guard = Guard(stream);
    let mut sent_at = Instant::now();
    while !stopped.load(Ordering::SeqCst) {
        if pending.load(Ordering::SeqCst) && sent_at.elapsed() > Duration::from_secs(30) {
            return Err("Окно приложения перестало принимать кадры демонстрации".into());
        }
        let mut sample = match rx.recv_timeout(Duration::from_millis(50)) {
            Ok(sample) => sample,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
            Err(_) => return Err("Источник демонстрации экрана отключён".into()),
        };
        if pending.load(Ordering::SeqCst) {
            continue;
        }
        let Some(image) = sample.image_buf_mut() else {
            continue;
        };
        if image.width() == 0 || image.height() == 0 {
            continue;
        }
        let result = unsafe {
            image
                .lock_base_addr(cv::pixel_buffer::LockFlags::READ_ONLY)
                .result()
                .map_err(|error| error.to_string())?;
            let address = CVPixelBufferGetBaseAddress(image);
            let stride = CVPixelBufferGetBytesPerRow(image);
            let packet = if address.is_null() || stride < image.width() * 4 {
                Err("Некорректный кадр демонстрации экрана".into())
            } else {
                rgba_packet(
                    image.width() as i32,
                    image.height() as i32,
                    std::slice::from_raw_parts(address, stride * image.height()),
                )
            };
            let _ = image.unlock_lock_base_addr(cv::pixel_buffer::LockFlags::READ_ONLY);
            packet
        }?;
        pending.store(true, Ordering::SeqCst);
        sent_at = Instant::now();
        if on_frame.send(Response::new(result)).is_err() {
            return Ok(());
        }
    }
    Ok(())
}
