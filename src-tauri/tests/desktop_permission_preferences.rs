#[path = "../src/desktop_permission_preferences.rs"]
mod desktop_permission_preferences;

use desktop_permission_preferences::{Choice, Permission, PreferenceStore, Preferences};
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

fn path() -> PathBuf {
    std::env::temp_dir()
        .join(format!(
            "sep-permissions-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
        .join("desktop-permissions.json")
}

#[test]
fn all_choices_survive_a_new_store_without_webview_data() {
    let path = path();
    let choices = Preferences::from([
        (Permission::Microphone, Choice::Granted),
        (Permission::Camera, Choice::Granted),
        (Permission::Geolocation, Choice::Denied),
        (Permission::ClipboardRead, Choice::Granted),
        (Permission::Notifications, Choice::Requested),
    ]);
    let mut store = PreferenceStore::open(path.clone(), Preferences::new()).unwrap();
    for (permission, choice) in &choices {
        store.save(*permission, *choice).unwrap();
    }
    drop(store);
    let reopened = PreferenceStore::open(path.clone(), Preferences::new()).unwrap();
    assert_eq!(reopened.choices(), choices);
    fs::remove_file(path).unwrap();
}

#[test]
fn migration_happens_once_and_reset_does_not_reimport_old_consent() {
    let path = path();
    let legacy = Preferences::from([(Permission::Microphone, Choice::Granted)]);
    let mut store = PreferenceStore::open(path.clone(), legacy.clone()).unwrap();
    assert_eq!(store.choices(), legacy);
    store.replace(Preferences::new()).unwrap();
    drop(store);
    assert!(PreferenceStore::open(path.clone(), legacy)
        .unwrap()
        .choices()
        .is_empty());
    fs::remove_file(path).unwrap();
}

#[test]
fn failed_write_preserves_the_previous_file_and_in_memory_choices() {
    let path = path();
    let choices = Preferences::from([(Permission::Camera, Choice::Denied)]);
    let mut store = PreferenceStore::open(path.clone(), choices.clone()).unwrap();
    let temporary = path.with_extension("json.tmp");
    fs::create_dir(&temporary).unwrap();
    assert!(store.save(Permission::Camera, Choice::Granted).is_err());
    assert_eq!(store.choices(), choices);
    assert_eq!(
        PreferenceStore::open(path.clone(), Preferences::new())
            .unwrap()
            .choices(),
        choices
    );
    fs::remove_dir(temporary).unwrap();
    fs::remove_file(path).unwrap();
}

#[test]
fn invalid_file_does_not_silently_grant_legacy_permissions() {
    let path = path();
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, b"{broken").unwrap();
    assert!(PreferenceStore::open(
        path.clone(),
        Preferences::from([(Permission::Microphone, Choice::Granted)])
    )
    .is_err());
    assert_eq!(fs::read(&path).unwrap(), b"{broken");
    fs::remove_file(path).unwrap();
}
