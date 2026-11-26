use std::process::Child;

#[cfg(windows)]
mod owned_job {
    use std::{
        os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
        sync::OnceLock,
    };
    use windows::{
        core::PCWSTR,
        Win32::{
            Foundation::HANDLE,
            System::JobObjects::{
                AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
                SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            },
        },
    };

    static JOB: OnceLock<Result<OwnedHandle, String>> = OnceLock::new();

    fn job() -> Result<&'static OwnedHandle, String> {
        JOB.get_or_init(|| unsafe {
            let handle =
                CreateJobObjectW(None, PCWSTR::null()).map_err(|error| error.to_string())?;
            let owned = OwnedHandle::from_raw_handle(handle.0);
            let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                std::mem::size_of_val(&limits) as u32,
            )
            .map_err(|error| error.to_string())?;
            Ok(owned)
        })
        .as_ref()
        .map_err(Clone::clone)
    }

    pub fn attach(child: &std::process::Child) -> Result<(), String> {
        let job = job()?;
        // Закрытие процесса Tauri освобождает job даже при process::exit и падении.
        unsafe {
            AssignProcessToJobObject(HANDLE(job.as_raw_handle()), HANDLE(child.as_raw_handle()))
        }
        .map_err(|error| error.to_string())
    }

    pub fn stop() {
        if let Some(Ok(job)) = JOB.get() {
            // Job содержит только процессы агента этого экземпляра приложения.
            let _ = unsafe { TerminateJobObject(HANDLE(job.as_raw_handle()), 0) };
        }
    }
}

/// Не оставляет локальный агент и его дочерние команды после выхода Tauri.
pub fn attach(child: &mut Child) -> Result<(), String> {
    #[cfg(windows)]
    if owned_job::attach(child).is_err() {
        let _ = child.kill();
        let _ = child.wait();
        return Err("Не удалось настроить безопасное завершение локального агента.".into());
    }
    #[cfg(not(windows))]
    let _ = child;
    Ok(())
}

pub fn stop() {
    #[cfg(windows)]
    owned_job::stop();
}
