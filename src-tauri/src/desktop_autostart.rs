use std::path::Path;

pub fn command(executable: &Path) -> String {
    format!("\"{}\" --autostart", executable.display())
}

#[cfg(windows)]
pub fn register() -> std::io::Result<()> {
    use winreg::{
        enums::{HKEY_CURRENT_USER, KEY_SET_VALUE},
        RegKey,
    };

    let executable = std::env::current_exe()?;
    let key = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(
        r"Software\Microsoft\Windows\CurrentVersion\Run",
        KEY_SET_VALUE,
    )?;
    // Не меняем StartupApproved: отключение пользователем остаётся в силе.
    key.set_value("SEP Chat", &command(&executable))
}

#[cfg(test)]
mod tests {
    #[test]
    fn quotes_the_executable_before_the_argument() {
        assert_eq!(
            super::command(std::path::Path::new(
                r"C:\Program Files\SEP Chat\sep-chat.exe"
            )),
            r#""C:\Program Files\SEP Chat\sep-chat.exe" --autostart"#
        );
    }
}
