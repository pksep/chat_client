use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::Write,
    path::PathBuf,
    sync::Mutex,
};
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "kebab-case")]
pub enum Permission {
    Microphone,
    Camera,
    Geolocation,
    ClipboardRead,
    Notifications,
    ScreenCapture,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Choice {
    Granted,
    Denied,
    Requested,
}

pub type Preferences = BTreeMap<Permission, Choice>;

pub struct PreferenceStore {
    path: PathBuf,
    choices: Preferences,
}

impl PreferenceStore {
    pub fn open(path: PathBuf, legacy: Preferences) -> Result<Self, String> {
        let choices = match fs::read(&path) {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map_err(|_| "Не удалось прочитать сохранённые разрешения")?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let mut store = Self {
                    path,
                    choices: Preferences::new(),
                };
                store.replace(legacy)?;
                return Ok(store);
            }
            Err(_) => return Err("Не удалось открыть сохранённые разрешения".into()),
        };
        Ok(Self { path, choices })
    }

    pub fn choices(&self) -> Preferences {
        self.choices.clone()
    }

    pub fn save(&mut self, permission: Permission, choice: Choice) -> Result<(), String> {
        let mut choices = self.choices();
        choices.insert(permission, choice);
        self.replace(choices)
    }

    pub fn replace(&mut self, choices: Preferences) -> Result<(), String> {
        let parent = self.path.parent().ok_or("Не найден каталог настроек")?;
        fs::create_dir_all(parent).map_err(|_| "Не удалось создать каталог настроек")?;
        let temporary = self.path.with_extension("json.tmp");
        let bytes = serde_json::to_vec(&choices).map_err(|_| "Не удалось сохранить разрешения")?;
        let write = || -> std::io::Result<()> {
            let mut file = File::create(&temporary)?;
            file.write_all(&bytes)?;
            // Updater завершает процесс: ответ возвращаем после записи на диск.
            file.sync_all()?;
            drop(file);
            fs::rename(&temporary, &self.path)
        };
        write()
            .map_err(|_| "Не удалось сохранить разрешения на диск. Проверьте свободное место")?;
        self.choices = choices;
        Ok(())
    }
}

#[derive(Default)]
pub struct DesktopPermissionPreferences(Mutex<Option<PreferenceStore>>);

impl DesktopPermissionPreferences {
    fn access<R: Runtime, T>(
        &self,
        app: &AppHandle<R>,
        legacy: Preferences,
        action: impl FnOnce(&mut PreferenceStore) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut state = self
            .0
            .lock()
            .map_err(|_| "Настройки разрешений недоступны")?;
        if state.is_none() {
            // app_config_dir привязан к постоянному bundle identifier, а не имени или версии.
            let path = app
                .path()
                .app_config_dir()
                .map_err(|_| "Не найден каталог настроек")?
                .join("desktop-permissions.json");
            *state = Some(PreferenceStore::open(path, legacy)?);
        }
        action(state.as_mut().unwrap())
    }
}

fn require_main<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("Настройки разрешений доступны только из основного окна".into())
    }
}

fn apply_choice<R: Runtime>(app: &AppHandle<R>, permission: Permission, choice: Choice) {
    use super::desktop_media_permissions::{DesktopMediaPermissions, MediaPermission};
    let permission = match permission {
        Permission::Microphone => MediaPermission::Microphone,
        Permission::Camera => MediaPermission::Camera,
        Permission::Geolocation => MediaPermission::Geolocation,
        Permission::ClipboardRead => MediaPermission::ClipboardRead,
        Permission::Notifications | Permission::ScreenCapture => return,
    };
    app.state::<DesktopMediaPermissions>().set_choice(
        permission,
        match choice {
            Choice::Granted => Some(true),
            Choice::Denied => Some(false),
            Choice::Requested => None,
        },
    );
}

async fn access_preferences<R: Runtime, T: Send + 'static>(
    app: AppHandle<R>,
    legacy: Preferences,
    action: impl FnOnce(&mut PreferenceStore) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<DesktopPermissionPreferences>()
            .access(&app, legacy, action)
    })
    .await
    .map_err(|_| "Не удалось открыть настройки разрешений")?
}

#[tauri::command]
pub async fn desktop_load_permission_preferences<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    legacy: Preferences,
) -> Result<Preferences, String> {
    require_main(&window)?;
    let choices = access_preferences(app.clone(), legacy, |store| Ok(store.choices())).await?;
    for (permission, choice) in &choices {
        apply_choice(&app, *permission, *choice);
    }
    Ok(choices)
}

#[tauri::command]
pub async fn desktop_save_permission_choice<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    permission: Permission,
    choice: Choice,
) -> Result<(), String> {
    require_main(&window)?;
    // Отзыв действует сразу, даже если сохранение на диск завершится ошибкой.
    if choice == Choice::Denied {
        apply_choice(&app, permission, choice);
    }
    access_preferences(app.clone(), Preferences::new(), move |store| {
        store.save(permission, choice)
    })
    .await?;
    apply_choice(&app, permission, choice);
    Ok(())
}

#[tauri::command]
pub async fn desktop_reset_permission_preferences<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
) -> Result<(), String> {
    require_main(&window)?;
    // Пустой файл сохраняем: старый WebView не должен вернуть сброшенное согласие.
    access_preferences(app, Preferences::new(), |store| {
        store.replace(Preferences::new())
    })
    .await
}
