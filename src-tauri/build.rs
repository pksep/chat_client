fn main() {
    tauri_build::build();
    #[cfg(windows)]
    {
        // Тестовый exe тоже использует TaskDialogIndirect из Common Controls 6.
        println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg-tests=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'");
    }
}
