use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    future::{poll_fn, Future},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU8, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    task::Poll,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

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
        "avif" => "image/avif",
        "mp4" => "video/mp4",
        "m4v" => "video/x-m4v",
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

static ACTIVE_FILE_WRITES: AtomicUsize = AtomicUsize::new(0);

#[derive(Default)]
pub struct DesktopFileDownloads(Mutex<HashMap<String, Arc<DownloadCancellation>>>);

#[derive(Default)]
struct DownloadCancellation {
    // 0 — загрузка, 1 — отменена, 2 — все байты сохранены.
    state: AtomicU8,
    changed: tokio::sync::Notify,
}

impl DownloadCancellation {
    fn cancel(&self) -> bool {
        if self
            .state
            .compare_exchange(0, 1, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
        {
            self.changed.notify_waiters();
            true
        } else {
            self.state.load(Ordering::SeqCst) == 1
        }
    }

    fn complete(&self) -> Result<(), FileError> {
        self.state
            .compare_exchange(0, 2, Ordering::SeqCst, Ordering::SeqCst)
            .map(|_| ())
            .map_err(|_| error("FILE_DOWNLOAD_CANCELLED", "Скачивание отменено"))
    }
}

async fn cancellable_download<T>(
    cancellation: &DownloadCancellation,
    transfer: impl Future<Output = Result<T, FileError>>,
) -> Result<T, FileError> {
    let mut transfer = std::pin::pin!(transfer);
    let mut changed = std::pin::pin!(cancellation.changed.notified());
    poll_fn(|context| {
        if cancellation.state.load(Ordering::SeqCst) == 1
            || changed.as_mut().poll(context).is_ready()
        {
            Poll::Ready(Err(error("FILE_DOWNLOAD_CANCELLED", "Скачивание отменено")))
        } else {
            transfer.as_mut().poll(context)
        }
    })
    .await
}

fn ensure_downloads<R: Runtime>(app: &AppHandle<R>) {
    if app.try_state::<DesktopFileDownloads>().is_none() {
        app.manage(DesktopFileDownloads::default());
    }
}

struct DownloadRegistration<R: Runtime> {
    app: AppHandle<R>,
    request_id: String,
}

impl<R: Runtime> Drop for DownloadRegistration<R> {
    fn drop(&mut self) {
        if let Ok(mut downloads) = self.app.state::<DesktopFileDownloads>().0.lock() {
            downloads.remove(&self.request_id);
        }
    }
}

#[tauri::command]
pub fn desktop_file_cancel_download<R: Runtime>(app: AppHandle<R>, request_id: String) -> bool {
    ensure_downloads(&app);
    app.state::<DesktopFileDownloads>()
        .0
        .lock()
        .ok()
        .and_then(|downloads| downloads.get(&request_id).cloned())
        .is_some_and(|download| download.cancel())
}

struct ActiveFileWrite;
impl ActiveFileWrite {
    fn begin() -> Self {
        ACTIVE_FILE_WRITES.fetch_add(1, Ordering::SeqCst);
        Self
    }
}
impl Drop for ActiveFileWrite {
    fn drop(&mut self) {
        ACTIVE_FILE_WRITES.fetch_sub(1, Ordering::SeqCst);
    }
}

#[tauri::command]
pub fn desktop_update_prepare() -> Result<(), String> {
    if ACTIVE_FILE_WRITES.load(Ordering::SeqCst) != 0 {
        return Err("Дождитесь завершения скачивания файлов".into());
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileOptions {
    url: String,
    file_name: Option<String>,
    mime_type: Option<String>,
    size: Option<u64>,
    request_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFileOptions {
    base64_data: String,
    file_name: Option<String>,
    mime_type: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FileError {
    code: &'static str,
    message: String,
}

impl From<std::io::Error> for FileError {
    fn from(error: std::io::Error) -> Self {
        Self {
            code: "FILE_IO",
            message: format!("Ошибка доступа к файлу: {error}"),
        }
    }
}

fn error(code: &'static str, message: impl Into<String>) -> FileError {
    FileError {
        code,
        message: message.into(),
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedFile {
    path: PathBuf,
    file_name: String,
    mime_type: String,
    size: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    source_modified: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFileInfo {
    name: String,
    mime_type: String,
    last_modified: Option<u64>,
    size: u64,
}

fn modified_stamp(metadata: &std::fs::Metadata) -> Option<String> {
    metadata
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|value| value.as_nanos().to_string())
}

async fn upload_metadata(path: &Path) -> Result<std::fs::Metadata, FileError> {
    let metadata = tokio::fs::metadata(path).await?;
    if !metadata.is_file() {
        return Err(error(
            "FILE_TYPE",
            "Выберите файл. Отправка папок не поддерживается",
        ));
    }
    if metadata.len() > 600 * 1024 * 1024 {
        return Err(error("FILE_SIZE", "Размер файла превышает лимит 600MB"));
    }
    Ok(metadata)
}

#[tauri::command]
pub async fn desktop_file_read_info(path: String) -> Result<LocalFileInfo, FileError> {
    let path = Path::new(&path);
    let metadata = upload_metadata(path).await?;
    Ok(LocalFileInfo {
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into(),
        mime_type: guess_mime_type(path),
        last_modified: metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|value| value.as_millis() as u64),
        size: metadata.len(),
    })
}

#[tauri::command]
pub async fn read_dropped_file(path: String) -> Result<tauri::ipc::Response, FileError> {
    upload_metadata(Path::new(&path)).await?;
    // Бинарный IPC не превращает большой файл в массив миллионов JSON-чисел.
    let mut file = tokio::fs::File::open(path).await?;
    let mut bytes = Vec::new();
    (&mut file)
        .take(600 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .await?;
    if bytes.len() > 600 * 1024 * 1024 {
        return Err(error("FILE_SIZE", "Размер файла превышает лимит 600MB"));
    }
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub async fn desktop_file_pick<R: Runtime>(
    app: AppHandle<R>,
    only_media: bool,
) -> Result<Vec<String>, String> {
    let mut dialog = app.dialog().file().set_title(if only_media {
        "Выберите фото или видео"
    } else {
        "Выберите файлы"
    });
    if only_media {
        dialog = dialog.add_filter(
            "Фото и видео",
            &[
                "jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "heic", "heif", "mp4", "mov",
                "webm", "avi", "mkv", "m4v", "avif",
            ],
        );
    }
    let (send, receive) = tokio::sync::oneshot::channel();
    dialog.pick_files(move |paths| {
        let _ = send.send(paths);
    });
    let paths = receive.await.map_err(|_| "Не удалось выбрать файлы")?;
    paths
        .unwrap_or_default()
        .into_iter()
        .map(|path| {
            path.into_path()
                .map(|path| path.to_string_lossy().into())
                .map_err(|_| "Не удалось прочитать путь файла".into())
        })
        .collect()
}

async fn file_digest(path: &Path) -> Result<String, FileError> {
    let mut file = tokio::fs::File::open(path).await?;
    let mut hash = Sha256::new();
    let mut buffer = vec![0_u8; 1024 * 1024];
    loop {
        let count = file.read(&mut buffer).await?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hash.finalize()))
}

async fn persist_record(path: PathBuf, file: &SavedFile) -> Result<(), FileError> {
    tokio::fs::create_dir_all(path.parent().unwrap()).await?;
    let temporary = path.with_extension("tmp");
    let bytes = serde_json::to_vec(file).map_err(|e| error("FILE_INDEX", e.to_string()))?;
    tokio::fs::write(&temporary, bytes).await?;
    tokio::fs::rename(temporary, path).await?;
    Ok(())
}

#[tauri::command]
pub async fn desktop_file_register_source<R: Runtime>(
    app: AppHandle<R>,
    options: FileOptions,
    path: String,
    sha256: String,
) -> Result<FileStatus, FileError> {
    let _active = ActiveFileWrite::begin();
    let path = tokio::fs::canonicalize(path).await?;
    let metadata = upload_metadata(&path).await?;
    let modified = modified_stamp(&metadata)
        .ok_or_else(|| error("FILE_IO", "Не удалось проверить исходный файл"))?;
    if options.size != Some(metadata.len())
        || file_digest(&path).await? != sha256
        || modified_stamp(&tokio::fs::metadata(&path).await?) != Some(modified.clone())
    {
        return Err(error(
            "FILE_CHANGED",
            "Исходный файл изменился после выбора",
        ));
    }
    let file = SavedFile {
        file_name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into(),
        path,
        size: metadata.len(),
        mime_type: options.mime_type.clone().unwrap_or_default(),
        source_modified: Some(modified),
    };
    persist_record(record_path(&app, &options)?, &file).await?;
    Ok(file.into())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStatus {
    downloaded: bool,
    path: String,
    file_name: String,
    mime_type: String,
}

impl From<SavedFile> for FileStatus {
    fn from(file: SavedFile) -> Self {
        Self {
            downloaded: true,
            path: file.path.to_string_lossy().into(),
            file_name: file.file_name,
            mime_type: file.mime_type,
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    request_id: String,
    bytes_downloaded: u64,
    total_bytes: u64,
    percent: Option<f64>,
}

fn file_key(value: &str) -> Result<String, FileError> {
    let mut url = Url::parse(value).map_err(|_| error("FILE_URL", "Некорректный адрес файла"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(error("FILE_URL", "Неподдерживаемый адрес файла"));
    }
    let query: Vec<_> = url
        .query_pairs()
        .filter(|(key, _)| !matches!(key.as_ref(), "v" | "preview" | "downloadName"))
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();
    url.set_query(None);
    if !query.is_empty() {
        url.query_pairs_mut().extend_pairs(query);
    }
    url.set_fragment(None);
    Ok(format!("{:x}", Sha256::digest(url.as_str().as_bytes())))
}

fn safe_file_name(value: &str) -> String {
    let name: String = value
        .chars()
        .take(180)
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    let name = name.trim().trim_end_matches(['.', ' ']);
    if name.is_empty() {
        return "file".into();
    }
    let stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    if matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9'))
    {
        format!("_{name}")
    } else {
        name.into()
    }
}

fn record_path<R: Runtime>(
    app: &AppHandle<R>,
    options: &FileOptions,
) -> Result<PathBuf, FileError> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| error("FILE_IO", e.to_string()))?
        .join("downloaded-files")
        .join(format!("{}.json", file_key(&options.url)?)))
}

async fn saved_file<R: Runtime>(
    app: &AppHandle<R>,
    options: &FileOptions,
) -> Result<Option<SavedFile>, FileError> {
    let path = record_path(app, options)?;
    let bytes = match tokio::fs::read(path).await {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.into()),
    };
    let file: SavedFile = serde_json::from_slice(&bytes).map_err(|_| {
        error(
            "FILE_INDEX",
            "Не удалось прочитать сведения о скачанном файле",
        )
    })?;
    Ok(
        if tokio::fs::metadata(&file.path).await.is_ok_and(|meta| {
            meta.is_file()
                && meta.len() == file.size
                && options
                    .size
                    .filter(|size| *size > 0)
                    .is_none_or(|size| size == meta.len())
                && file
                    .source_modified
                    .as_ref()
                    .is_none_or(|modified| modified_stamp(&meta).as_ref() == Some(modified))
        }) {
            Some(file)
        } else {
            None
        },
    )
}

#[tauri::command]
pub async fn desktop_file_status<R: Runtime>(
    app: AppHandle<R>,
    options: FileOptions,
) -> Result<FileStatus, FileError> {
    Ok(match saved_file(&app, &options).await? {
        Some(file) => file.into(),
        None => FileStatus {
            downloaded: false,
            path: String::new(),
            file_name: safe_file_name(options.file_name.as_deref().unwrap_or("file")),
            mime_type: options.mime_type.unwrap_or_default(),
        },
    })
}

async fn create_download(
    directory: &std::path::Path,
    name: &str,
) -> Result<(PathBuf, tokio::fs::File), FileError> {
    let name_path = std::path::Path::new(name);
    let stem = name_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let extension = name_path.extension().and_then(|s| s.to_str());
    for index in 0..10_000 {
        let candidate = if index == 0 {
            name.into()
        } else {
            format!(
                "{stem} ({index}){}",
                extension.map(|ext| format!(".{ext}")).unwrap_or_default()
            )
        };
        let path = directory.join(candidate);
        match tokio::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .await
        {
            Ok(file) => return Ok((path, file)),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.into()),
        }
    }
    Err(error(
        "FILE_NAME",
        "Не удалось выбрать имя для скачиваемого файла",
    ))
}

#[tauri::command]
pub async fn desktop_file_download<R: Runtime>(
    app: AppHandle<R>,
    options: FileOptions,
) -> Result<FileStatus, FileError> {
    let _active = ActiveFileWrite::begin();
    ensure_downloads(&app);
    let request_id = options
        .request_id
        .clone()
        .unwrap_or(file_key(&options.url)?);
    let cancellation = Arc::new(DownloadCancellation::default());
    {
        let state = app.state::<DesktopFileDownloads>();
        let mut downloads = state
            .0
            .lock()
            .map_err(|_| error("FILE_REQUEST", "Не удалось начать скачивание"))?;
        if downloads.contains_key(&request_id) {
            return Err(error("FILE_REQUEST", "Скачивание уже выполняется"));
        }
        downloads.insert(request_id.clone(), cancellation.clone());
    }
    let _registration = DownloadRegistration {
        app: app.clone(),
        request_id: request_id.clone(),
    };
    // Подтверждаем регистрацию до ожидания HTTP-заголовков, чтобы отменить можно было сразу.
    let _ = app.emit(
        "sep-chat://file-download-progress",
        DownloadProgress {
            request_id: request_id.clone(),
            bytes_downloaded: 0,
            total_bytes: 0,
            percent: None,
        },
    );
    if let Some(file) = saved_file(&app, &options).await? {
        cancellation.complete()?;
        return Ok(file.into());
    }
    let record_path = record_path(&app, &options)?;
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(3600))
        .build()
        .map_err(|e| error("FILE_NETWORK", e.to_string()))?;
    let mut response = cancellable_download(&cancellation, async {
        client
            .get(&options.url)
            .send()
            .await
            .and_then(|response| response.error_for_status())
            .map_err(|e| error("FILE_NETWORK", format!("Не удалось скачать файл: {e}")))
    })
    .await?;
    let total = response.content_length().or(options.size).unwrap_or(0);
    let directory = app
        .path()
        .download_dir()
        .map_err(|e| error("FILE_IO", e.to_string()))?
        .join("SEP Chat");
    tokio::fs::create_dir_all(&directory).await?;
    let name = safe_file_name(options.file_name.as_deref().unwrap_or("file"));
    let (path, mut output) = create_download(&directory, &name).await?;
    let mut received = 0_u64;
    let mut last_progress = Instant::now() - Duration::from_secs(1);
    let transfer: Result<(), FileError> = cancellable_download(&cancellation, async {
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| error("FILE_NETWORK", e.to_string()))?
        {
            output.write_all(&chunk).await?;
            received += chunk.len() as u64;
            if last_progress.elapsed() >= Duration::from_millis(100) {
                let _ = app.emit(
                    "sep-chat://file-download-progress",
                    DownloadProgress {
                        request_id: request_id.clone(),
                        bytes_downloaded: received,
                        total_bytes: total,
                        percent: (total > 0)
                            .then(|| (received as f64 / total as f64 * 100.0).min(100.0)),
                    },
                );
                last_progress = Instant::now();
            }
        }
        output.flush().await?;
        output.sync_all().await?;
        if total > 0 && received != total
            || options
                .size
                .filter(|size| *size > 0)
                .is_some_and(|size| received != size)
        {
            return Err(error(
                "FILE_SIZE",
                "Файл скачан не полностью. Повторите скачивание",
            ));
        }
        Ok(())
    })
    .await
    .and_then(|_| cancellation.complete());
    drop(output);
    if let Err(e) = transfer {
        let _ = tokio::fs::remove_file(&path).await;
        return Err(e);
    }
    let file = SavedFile {
        file_name: path.file_name().unwrap().to_string_lossy().into(),
        path: path.clone(),
        mime_type: options.mime_type.unwrap_or_default(),
        size: received,
        source_modified: None,
    };
    let persist: Result<(), FileError> = async { persist_record(record_path, &file).await }.await;
    if let Err(e) = persist {
        let _ = tokio::fs::remove_file(&path).await;
        return Err(e);
    }
    Ok(file.into())
}

#[tauri::command]
pub async fn desktop_file_save<R: Runtime>(
    app: AppHandle<R>,
    options: SaveFileOptions,
) -> Result<FileStatus, FileError> {
    let _active = ActiveFileWrite::begin();
    let bytes = STANDARD.decode(options.base64_data).map_err(|_| {
        error(
            "FILE_DATA",
            "Не удалось прочитать данные сохраняемого файла",
        )
    })?;
    let directory = app
        .path()
        .download_dir()
        .map_err(|e| error("FILE_IO", e.to_string()))?
        .join("SEP Chat");
    tokio::fs::create_dir_all(&directory).await?;
    let name = safe_file_name(options.file_name.as_deref().unwrap_or("file"));
    let (path, mut output) = create_download(&directory, &name).await?;
    let write: Result<(), FileError> = async {
        output.write_all(&bytes).await?;
        output.flush().await?;
        output.sync_all().await?;
        Ok(())
    }
    .await;
    drop(output);
    if let Err(e) = write {
        let _ = tokio::fs::remove_file(&path).await;
        return Err(e);
    }
    Ok(SavedFile {
        file_name: path.file_name().unwrap().to_string_lossy().into(),
        path,
        mime_type: options.mime_type.unwrap_or_default(),
        size: bytes.len() as u64,
        source_modified: None,
    }
    .into())
}

#[tauri::command]
pub async fn desktop_file_open<R: Runtime>(
    app: AppHandle<R>,
    options: FileOptions,
    reveal: Option<bool>,
) -> Result<FileStatus, FileError> {
    let file = saved_file(&app, &options).await?.ok_or_else(|| {
        error(
            "FILE_NOT_FOUND",
            "Файл удалён или перемещён. Скачайте его заново",
        )
    })?;
    if reveal.unwrap_or(false) {
        app.opener().reveal_item_in_dir(&file.path)
    } else {
        app.opener()
            .open_path(file.path.to_string_lossy(), None::<&str>)
    }
    .map_err(|e| error("FILE_OPEN", format!("Не удалось открыть файл: {e}")))?;
    Ok(file.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use tauri::ipc::IpcResponse;

    #[test]
    fn local_upload_reads_binary_and_persists_original_location() {
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let handle = app.handle().clone();
        let body = "Локальный исходник\n".repeat(10_000).into_bytes();
        let url = serve_file("200 OK", &body);
        let directory =
            std::env::temp_dir().join(format!("sep-upload-{}", file_key(&url).unwrap()));
        std::fs::create_dir(&directory).unwrap();
        let original = directory.join("Исходный файл.txt");
        std::fs::write(&original, &body).unwrap();
        tauri::async_runtime::block_on(async {
            let path = original.to_string_lossy().to_string();
            let info = desktop_file_read_info(path.clone()).await.unwrap();
            assert_eq!(info.name, "Исходный файл.txt");
            assert_eq!(info.size, body.len() as u64);
            assert_eq!(info.mime_type, "text/plain");
            assert!(info.last_modified.is_some());
            match read_dropped_file(path.clone())
                .await
                .unwrap()
                .body()
                .unwrap()
            {
                tauri::ipc::InvokeResponseBody::Raw(bytes) => assert_eq!(bytes, body),
                _ => panic!("Файл должен передаваться бинарно"),
            }
            let saved = desktop_file_register_source(
                handle.clone(),
                options(&url, body.len() as u64),
                path.clone(),
                format!("{:x}", Sha256::digest(&body)),
            )
            .await
            .unwrap();
            assert_eq!(
                PathBuf::from(&saved.path),
                tokio::fs::canonicalize(&original).await.unwrap()
            );
            let status = desktop_file_status(handle.clone(), options(&url, body.len() as u64))
                .await
                .unwrap();
            assert!(status.downloaded);
            assert_eq!(status.path, saved.path);
            // Индекс читается с диска, исходник повторно не скачивается.
            assert_eq!(
                desktop_file_download(handle.clone(), options(&url, body.len() as u64))
                    .await
                    .unwrap()
                    .path,
                saved.path
            );
            assert!(
                tokio::fs::read(record_path(&handle, &options(&url, body.len() as u64)).unwrap())
                    .await
                    .unwrap()
                    .len()
                    > 0
            );
            std::fs::remove_file(&original).unwrap();
            assert!(
                !desktop_file_status(handle.clone(), options(&url, body.len() as u64))
                    .await
                    .unwrap()
                    .downloaded
            );
            let downloaded =
                desktop_file_download(handle.clone(), options(&url, body.len() as u64))
                    .await
                    .unwrap();
            assert_ne!(downloaded.path, saved.path);
            assert_eq!(
                Path::new(&downloaded.path)
                    .parent()
                    .unwrap()
                    .file_name()
                    .unwrap(),
                "SEP Chat"
            );
            assert_eq!(tokio::fs::read(&downloaded.path).await.unwrap(), body);
            tokio::fs::remove_file(downloaded.path).await.unwrap();
            tokio::fs::remove_file(
                record_path(&handle, &options(&url, body.len() as u64)).unwrap(),
            )
            .await
            .unwrap();
        });
        std::fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn changed_source_cannot_be_registered_or_opened_as_uploaded_bytes() {
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let handle = app.handle().clone();
        let original = std::env::temp_dir().join(format!(
            "sep-source-{}.txt",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let url = "https://files.test/changed-source";
        std::fs::write(&original, b"first").unwrap();
        tauri::async_runtime::block_on(async {
            let path = original.to_string_lossy().to_string();
            let digest = format!("{:x}", Sha256::digest(b"first"));
            desktop_file_register_source(
                handle.clone(),
                options(url, 5),
                path.clone(),
                digest.clone(),
            )
            .await
            .unwrap();
            std::fs::write(&original, b"other").unwrap();
            std::fs::OpenOptions::new()
                .write(true)
                .open(&original)
                .unwrap()
                .set_modified(std::time::SystemTime::now() + Duration::from_secs(1))
                .unwrap();
            assert!(
                !desktop_file_status(handle.clone(), options(url, 5))
                    .await
                    .unwrap()
                    .downloaded
            );
            assert_eq!(
                desktop_file_register_source(handle.clone(), options(url, 5), path, digest)
                    .await
                    .err()
                    .unwrap()
                    .code,
                "FILE_CHANGED"
            );
            assert_eq!(
                desktop_file_open(handle.clone(), options(url, 5), Some(true))
                    .await
                    .err()
                    .unwrap()
                    .code,
                "FILE_NOT_FOUND"
            );
            assert_eq!(tokio::fs::read(&original).await.unwrap(), b"other");
            assert_eq!(
                desktop_file_read_info(original.parent().unwrap().to_string_lossy().into())
                    .await
                    .err()
                    .unwrap()
                    .code,
                "FILE_TYPE"
            );
            tokio::fs::remove_file(record_path(&handle, &options(url, 5)).unwrap())
                .await
                .unwrap();
        });
        std::fs::remove_file(original).unwrap();
    }

    fn serve_file(status: &str, body: &[u8]) -> String {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let response = format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        );
        let body = body.to_vec();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 4096];
            let _ = stream.read(&mut request);
            stream.write_all(response.as_bytes()).unwrap();
            stream.write_all(&body).unwrap();
        });
        format!("http://{address}/media/object/tauri-test-file")
    }

    fn options(url: &str, size: u64) -> FileOptions {
        FileOptions {
            url: url.into(),
            size: Some(size),
            request_id: Some("desktop-test".into()),
            file_name: Some("SEP-Chat-проверка.txt".into()),
            mime_type: Some("text/plain".into()),
        }
    }

    #[test]
    fn download_persists_real_bytes_and_detects_removed_files() {
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let handle = app.handle().clone();
        let body = "Проверка Tauri\n".as_bytes();
        let url = serve_file("200 OK", body);
        tauri::async_runtime::block_on(async {
            assert!(
                !desktop_file_status(handle.clone(), options(&url, body.len() as u64))
                    .await
                    .unwrap()
                    .downloaded
            );
            let saved = desktop_file_download(handle.clone(), options(&url, body.len() as u64))
                .await
                .unwrap();
            assert_eq!(tokio::fs::read(&saved.path).await.unwrap(), body);
            assert!(
                desktop_file_status(handle.clone(), options(&url, body.len() as u64))
                    .await
                    .unwrap()
                    .downloaded
            );
            // Сервер уже закрыт: повторная загрузка должна использовать сохранённый файл.
            assert_eq!(
                desktop_file_download(handle.clone(), options(&url, body.len() as u64))
                    .await
                    .unwrap()
                    .path,
                saved.path
            );
            tokio::fs::remove_file(saved.path).await.unwrap();
            assert!(
                !desktop_file_status(handle.clone(), options(&url, body.len() as u64))
                    .await
                    .unwrap()
                    .downloaded
            );
            assert_eq!(
                desktop_file_open(handle.clone(), options(&url, body.len() as u64), None)
                    .await
                    .err()
                    .unwrap()
                    .code,
                "FILE_NOT_FOUND"
            );
            tokio::fs::remove_file(
                record_path(&handle, &options(&url, body.len() as u64)).unwrap(),
            )
            .await
            .unwrap();
        });
    }

    #[test]
    fn cancellation_interrupts_headers_and_body_cleans_partial_file_and_allows_retry() {
        for send_partial_body in [false, true] {
            let app = tauri::test::mock_builder()
                .build(tauri::test::mock_context(tauri::test::noop_assets()))
                .unwrap();
            let handle = app.handle().clone();
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let url = format!(
                "http://{}/media/object/cancel-test",
                listener.local_addr().unwrap()
            );
            let (ready, started) = tokio::sync::oneshot::channel();
            let server = std::thread::spawn(move || {
                let (mut connection, _) = listener.accept().unwrap();
                connection
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut request = [0_u8; 4096];
                connection.read(&mut request).unwrap();
                if send_partial_body {
                    connection.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 4096\r\nConnection: close\r\n\r\npartial").unwrap();
                    connection.flush().unwrap();
                }
                ready.send(()).unwrap();
                let disconnected = loop {
                    match connection.read(&mut request) {
                        Ok(0) => break true,
                        Ok(_) => continue,
                        Err(_) => break false,
                    }
                };
                drop(connection);
                listener.set_nonblocking(true).unwrap();
                let deadline = Instant::now() + Duration::from_secs(5);
                loop {
                    if let Ok((mut retry, _)) = listener.accept() {
                        retry
                            .set_read_timeout(Some(Duration::from_secs(5)))
                            .unwrap();
                        retry.read(&mut request).unwrap();
                        retry.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 4096\r\nConnection: close\r\n\r\n").unwrap();
                        retry.write_all(&vec![b'a'; 4096]).unwrap();
                        break;
                    }
                    assert!(
                        Instant::now() < deadline,
                        "Повторное скачивание не началось"
                    );
                    std::thread::sleep(Duration::from_millis(10));
                }
                disconnected
            });
            let name = format!(
                "sep-cancel-{}.txt",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            );
            let partial = handle
                .path()
                .download_dir()
                .unwrap()
                .join("SEP Chat")
                .join(&name);
            tauri::async_runtime::block_on(async {
                let mut initial = options(&url, 4096);
                initial.file_name = Some(name.clone());
                let request_id = initial.request_id.clone().unwrap();
                let initial_app = handle.clone();
                let download = tauri::async_runtime::spawn(async move {
                    desktop_file_download(initial_app, initial).await
                });
                started.await.unwrap();
                if send_partial_body {
                    let deadline = Instant::now() + Duration::from_secs(5);
                    while !tokio::fs::metadata(&partial)
                        .await
                        .is_ok_and(|file| file.len() > 0)
                    {
                        assert!(Instant::now() < deadline, "Не появился недокачанный файл");
                        tokio::time::sleep(Duration::from_millis(10)).await;
                    }
                }
                assert!(desktop_file_cancel_download(
                    handle.clone(),
                    request_id.clone()
                ));
                let failure = tokio::time::timeout(Duration::from_secs(5), download)
                    .await
                    .unwrap()
                    .unwrap()
                    .err()
                    .unwrap();
                assert_eq!(failure.code, "FILE_DOWNLOAD_CANCELLED");
                assert!(!partial.exists());
                assert!(!record_path(&handle, &options(&url, 4096)).unwrap().exists());
                assert!(!desktop_file_cancel_download(handle.clone(), request_id));
                let mut retry = options(&url, 4096);
                retry.file_name = Some(name.clone());
                let file = desktop_file_download(handle.clone(), retry).await.unwrap();
                assert_eq!(file.file_name, name);
                assert_eq!(tokio::fs::read(&file.path).await.unwrap(), vec![b'a'; 4096]);
                tokio::fs::remove_file(&file.path).await.unwrap();
                tokio::fs::remove_file(record_path(&handle, &options(&url, 4096)).unwrap())
                    .await
                    .unwrap();
            });
            assert!(server.join().unwrap(), "Отмена не закрыла HTTP-соединение");
        }
    }

    #[test]
    fn failed_download_never_becomes_available() {
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let handle = app.handle().clone();
        for (status, expected_size, expected_code) in [
            ("404 Not Found", 1, "FILE_NETWORK"),
            ("200 OK", 100, "FILE_SIZE"),
        ] {
            let url = serve_file(status, b"x");
            tauri::async_runtime::block_on(async {
                assert_eq!(
                    desktop_file_download(handle.clone(), options(&url, expected_size))
                        .await
                        .err()
                        .unwrap()
                        .code,
                    expected_code
                );
                assert!(
                    !desktop_file_status(handle.clone(), options(&url, expected_size))
                        .await
                        .unwrap()
                        .downloaded
                );
            });
        }
    }

    #[test]
    fn generated_files_preserve_bytes_and_never_overwrite_existing_exports() {
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let handle = app.handle().clone();
        let bytes = "Транскрибация тестового звонка\n".as_bytes();
        tauri::async_runtime::block_on(async {
            let mut paths = Vec::new();
            for _ in 0..2 {
                let saved = desktop_file_save(
                    handle.clone(),
                    SaveFileOptions {
                        base64_data: STANDARD.encode(bytes),
                        file_name: Some("SEP-Chat-экспорт.txt".into()),
                        mime_type: Some("text/plain".into()),
                    },
                )
                .await
                .unwrap();
                assert_eq!(tokio::fs::read(&saved.path).await.unwrap(), bytes);
                assert!(!paths.contains(&saved.path));
                paths.push(saved.path);
            }
            for path in paths {
                tokio::fs::remove_file(path).await.unwrap();
            }
            assert_eq!(
                desktop_file_save(
                    handle,
                    SaveFileOptions {
                        base64_data: "некорректные данные".into(),
                        file_name: None,
                        mime_type: None,
                    }
                )
                .await
                .err()
                .unwrap()
                .code,
                "FILE_DATA"
            );
        });
    }

    #[test]
    fn names_stay_inside_download_directory() {
        assert_eq!(safe_file_name("../Документ:1?.pdf"), ".._Документ_1_.pdf");
        assert_eq!(safe_file_name("CON.txt"), "_CON.txt");
        assert_eq!(safe_file_name("...  "), "file");
    }

    #[test]
    fn cache_versions_and_previews_share_original_identity() {
        assert_eq!(
            file_key("https://files.test/a?v=1&preview=webp").unwrap(),
            file_key("https://files.test/a?v=2&downloadName=a.png").unwrap()
        );
        assert_ne!(
            file_key("https://files.test/a?token=1").unwrap(),
            file_key("https://files.test/a?token=2").unwrap()
        );
        assert!(file_key("file:///C:/private.txt").is_err());
    }
}
