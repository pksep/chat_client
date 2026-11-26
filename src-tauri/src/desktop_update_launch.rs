use std::io;
use winreg::{
    enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE},
    RegKey,
};

pub fn take_pending_foreground(identifier: &str, version: &str) -> io::Result<bool> {
    let path = format!(r"Software\{identifier}\Updater");
    let pending = [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE]
        .into_iter()
        .any(|hive| {
            RegKey::predef(hive)
                .open_subkey(&path)
                .ok()
                .and_then(|key| key.get_value::<String, _>("PendingForegroundVersion").ok())
                .is_some_and(|pending| pending == version)
        });
    if !pending {
        return Ok(false);
    }
    // NSIS передаёт исходный --autostart. Маркер установщика действует один раз
    // и относится к identifier/версии, поэтому не меняет обычный вход в Windows.
    let (state, _) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(&path)?;
    if state
        .get_value::<String, _>("ShownForegroundVersion")
        .ok()
        .as_deref()
        == Some(version)
    {
        return Ok(false);
    }
    state.set_value("ShownForegroundVersion", &version)?;
    Ok(true)
}
