use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_opener::OpenerExt;
use tokio::io::AsyncWriteExt;

static ACTIVE_FILE_WRITES: AtomicUsize = AtomicUsize::new(0);

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
    if let Some(file) = saved_file(&app, &options).await? {
        return Ok(file.into());
    }
    let record_path = record_path(&app, &options)?;
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(3600))
        .build()
        .map_err(|e| error("FILE_NETWORK", e.to_string()))?;
    let mut response = client
        .get(&options.url)
        .send()
        .await
        .and_then(|response| response.error_for_status())
        .map_err(|e| error("FILE_NETWORK", format!("Не удалось скачать файл: {e}")))?;
    let total = response.content_length().or(options.size).unwrap_or(0);
    let directory = app
        .path()
        .download_dir()
        .map_err(|e| error("FILE_IO", e.to_string()))?
        .join("SEP Chat");
    tokio::fs::create_dir_all(&directory).await?;
    let name = safe_file_name(options.file_name.as_deref().unwrap_or("file"));
    let (path, mut output) = create_download(&directory, &name).await?;
    let request_id = options.request_id.clone().unwrap_or_default();
    let mut received = 0_u64;
    let mut last_progress = Instant::now() - Duration::from_secs(1);
    let transfer: Result<(), FileError> = async {
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
    }
    .await;
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
    };
    let persist: Result<(), FileError> = async {
        tokio::fs::create_dir_all(record_path.parent().unwrap()).await?;
        let temporary = record_path.with_extension("tmp");
        let bytes = serde_json::to_vec(&file).map_err(|e| error("FILE_INDEX", e.to_string()))?;
        tokio::fs::write(&temporary, bytes).await?;
        tokio::fs::rename(temporary, record_path).await?;
        Ok(())
    }
    .await;
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
