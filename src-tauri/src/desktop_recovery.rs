use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs, io::Write, path::Path, sync::Mutex};
use tauri::{webview::cookie::Cookie, Manager, Runtime, WebviewWindow};
use windows::Win32::{
    Foundation::{LocalFree, HLOCAL},
    Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    },
};

const KEYS: &[&str] = &[
    "chat_auth_session",
    "erp_bootstrap_token",
    "chat_qr_bootstrap_source",
    "erp-theme-color-scheme",
    "chat_runtime_organizations",
    "chat_runtime_last_organization",
];
const ERROR: &str = "Не удалось сохранить или восстановить данные входа и тему";
static LOCK: Mutex<()> = Mutex::new(());
type Storage = BTreeMap<String, String>;

#[derive(Default, Deserialize, Serialize)]
struct Snapshot {
    storage: Storage,
    cookies: BTreeMap<String, String>,
}

fn protect(bytes: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
    let input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr().cast_mut(),
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    unsafe {
        if encrypt {
            CryptProtectData(
                &input,
                None,
                None,
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                None,
                None,
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        }
        .map_err(|_| ERROR.to_string())?;
        let result = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(output.pbData.cast())));
        Ok(result)
    }
}

fn read(path: &Path) -> Result<Snapshot, String> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&protect(&bytes, false)?).map_err(|_| ERROR.into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Snapshot::default()),
        Err(_) => Err(ERROR.into()),
    }
}

fn write(path: &Path, snapshot: &Snapshot) -> Result<(), String> {
    let bytes = serde_json::to_vec(snapshot).map_err(|_| ERROR)?;
    let encrypted = protect(&bytes, true)?;
    let operation = || -> std::io::Result<()> {
        fs::create_dir_all(path.parent().unwrap())?;
        let temporary = path.with_extension("tmp");
        let mut file = fs::File::create(&temporary)?;
        file.write_all(&encrypted)?;
        file.sync_all()?;
        drop(file);
        fs::rename(temporary, path)
    };
    operation().map_err(|_| ERROR.into())
}

fn path<R: Runtime>(window: &WebviewWindow<R>) -> Result<std::path::PathBuf, String> {
    if window.label() != "main" {
        return Err(ERROR.into());
    }
    // Стабильный identifier, независимо от имени продукта, версии и WebView-профиля.
    window
        .path()
        .app_config_dir()
        .map(|dir| dir.join("desktop-recovery.dpapi"))
        .map_err(|_| ERROR.into())
}

fn validate(storage: &Storage) -> Result<(), String> {
    if storage.keys().any(|key| !KEYS.contains(&key.as_str()))
        || storage.values().map(String::len).sum::<usize>() > 1_048_576
    {
        return Err(ERROR.into());
    }
    Ok(())
}

fn has_session(storage: &Storage) -> bool {
    ["chat_auth_session", "erp_bootstrap_token"]
        .iter()
        .any(|key| storage.get(*key).is_some_and(|value| !value.is_empty()))
}

#[tauri::command]
pub async fn desktop_restore_recovery<R: Runtime>(
    window: WebviewWindow<R>,
    current: Storage,
) -> Result<Storage, String> {
    validate(&current)?;
    let _guard = LOCK.lock().map_err(|_| ERROR)?;
    let path = path(&window)?;
    let mut snapshot = read(&path)?;
    if current.is_empty() {
        validate(&snapshot.storage)?;
        if has_session(&snapshot.storage) {
            for value in snapshot.cookies.values() {
                if let Ok(cookie) = Cookie::parse(value.clone()) {
                    if cookie.expires_datetime().is_some_and(|expiry| {
                        expiry > tauri::webview::cookie::time::OffsetDateTime::now_utc()
                    }) {
                        window.set_cookie(cookie).map_err(|_| ERROR)?;
                    }
                }
            }
        }
        Ok(snapshot.storage)
    } else {
        // Существующий профиль, включая явный выход, всегда приоритетнее копии.
        let mut current = current;
        if !current.contains_key("erp-theme-color-scheme") {
            if let Some(theme) = snapshot.storage.get("erp-theme-color-scheme") {
                current.insert("erp-theme-color-scheme".into(), theme.clone());
            }
        }
        snapshot.storage = current.clone();
        if !has_session(&current) {
            snapshot.cookies.clear();
        }
        write(&path, &snapshot)?;
        Ok(current)
    }
}

#[tauri::command]
pub async fn desktop_save_recovery<R: Runtime>(
    window: WebviewWindow<R>,
    storage: Storage,
) -> Result<(), String> {
    validate(&storage)?;
    let _guard = LOCK.lock().map_err(|_| ERROR)?;
    let path = path(&window)?;
    let mut snapshot = read(&path)?;
    if !has_session(&storage) {
        snapshot.cookies.clear();
    }
    snapshot.storage = storage;
    write(&path, &snapshot)
}

pub fn remember_cookies<R: Runtime>(
    window: &WebviewWindow<R>,
    cookies: &[Cookie<'static>],
) -> Result<(), String> {
    if cookies.is_empty() {
        return Ok(());
    }
    let _guard = LOCK.lock().map_err(|_| ERROR)?;
    let path = path(window)?;
    let mut snapshot = read(&path)?;
    for cookie in cookies {
        let mut cookie = cookie.clone();
        let key = format!(
            "{}:{}:{}",
            cookie.domain().unwrap_or(""),
            cookie.path().unwrap_or("/"),
            cookie.name()
        );
        if let Some(age) = cookie.max_age() {
            cookie.set_expires(
                tauri::webview::cookie::time::OffsetDateTime::now_utc().saturating_add(age),
            );
            cookie.set_max_age(None);
        }
        if cookie
            .expires_datetime()
            .is_some_and(|expiry| expiry > tauri::webview::cookie::time::OffsetDateTime::now_utc())
        {
            snapshot.cookies.insert(key, cookie.to_string());
        } else {
            snapshot.cookies.remove(&key);
        }
    }
    write(&path, &snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypted_snapshot_survives_reopen_and_replacement() {
        let dir = std::env::temp_dir().join(format!(
            "sep-recovery-{}-{}",
            std::process::id(),
            tauri::webview::cookie::time::OffsetDateTime::now_utc().unix_timestamp_nanos()
        ));
        let path = dir.join("recovery.dpapi");
        let mut snapshot = Snapshot::default();
        snapshot.storage.insert(
            "chat_auth_session".into(),
            "synthetic-private-session".into(),
        );
        snapshot
            .storage
            .insert("erp-theme-color-scheme".into(), "theme-dark".into());
        write(&path, &snapshot).unwrap();
        let bytes = fs::read(&path).unwrap();
        assert!(!bytes
            .windows(25)
            .any(|part| part == b"synthetic-private-session"));
        assert_eq!(read(&path).unwrap().storage, snapshot.storage);
        snapshot.storage.remove("chat_auth_session");
        write(&path, &snapshot).unwrap();
        assert!(!has_session(&read(&path).unwrap().storage));
        assert_eq!(
            read(&path).unwrap().storage["erp-theme-color-scheme"],
            "theme-dark"
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn damaged_ciphertext_is_not_restored() {
        let mut bytes = protect(b"synthetic", true).unwrap();
        let last = bytes.len() - 1;
        bytes[last] ^= 1;
        assert!(protect(&bytes, false).is_err());
        assert!(validate(&BTreeMap::from([("unrelated".into(), "value".into())])).is_err());
    }
}
