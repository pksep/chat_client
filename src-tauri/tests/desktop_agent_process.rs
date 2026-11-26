#![cfg(windows)]

#[path = "../src/desktop_agent_process.rs"]
mod desktop_agent_process;

use std::{
    fs::{self, OpenOptions},
    io::{BufRead, BufReader, Read, Write},
    os::windows::process::CommandExt,
    path::PathBuf,
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const HIDE_WINDOW: u32 = 0x08000000;

#[test]
fn agent_holds_its_executable_fixture() {
    if std::env::var_os("SEP_QA_AGENT_HOLD").is_some() {
        if let Some(directory) = std::env::var_os("SEP_QA_EXTERNAL_DIR") {
            // Дочернее приложение запускается только после назначения агента в Job.
            let mut trigger = [0];
            std::io::stdin().read_exact(&mut trigger).unwrap();
            Command::new(PathBuf::from(directory).join("external-app.exe"))
                .args(["--exact", "external_application_fixture", "--nocapture"])
                .env_remove("SEP_QA_AGENT_HOLD")
                .creation_flags(HIDE_WINDOW)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .unwrap();
        }
        thread::sleep(Duration::from_secs(60));
    }
}

#[test]
fn external_application_fixture() {
    let Some(directory) = std::env::var_os("SEP_QA_EXTERNAL_DIR") else {
        return;
    };
    let directory = PathBuf::from(directory);
    fs::write(directory.join("external-ready"), b"ready").unwrap();
    let deadline = Instant::now() + Duration::from_secs(15);
    while !directory.join("external-stop").exists() && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(20));
    }
}

#[test]
fn parent_exits_without_rust_drop_fixture() {
    let Some(executable) = std::env::var_os("SEP_QA_AGENT_HELPER") else {
        return;
    };
    let mut child = Command::new(executable)
        .args([
            "--exact",
            "agent_holds_its_executable_fixture",
            "--nocapture",
        ])
        .env("SEP_QA_AGENT_HOLD", "1")
        .env_remove("SEP_QA_AGENT_HELPER")
        .creation_flags(HIDE_WINDOW)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    desktop_agent_process::attach(&mut child).unwrap();
    if let Some(directory) = std::env::var_os("SEP_QA_EXTERNAL_DIR") {
        child.stdin.as_mut().unwrap().write_all(b"x").unwrap();
        let ready = PathBuf::from(directory).join("external-ready");
        let deadline = Instant::now() + Duration::from_secs(5);
        while !ready.exists() {
            assert!(Instant::now() < deadline, "Приложение-стенд не запустилось");
            thread::sleep(Duration::from_millis(20));
        }
    }
    println!("QA_AGENT_PID={}", child.id());
    std::io::stdout().flush().unwrap();
    let mut trigger = [0];
    std::io::stdin().read_exact(&mut trigger).unwrap();
    if std::env::var_os("SEP_QA_AGENT_STOP").is_some() {
        desktop_agent_process::stop();
    }
    // Без STOP повторяет exit updater: Rust Drop и Tauri callback не выполняются.
    std::process::exit(0);
}

struct Parent(Child);
impl Drop for Parent {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

#[test]
fn abrupt_parent_exit_releases_agent_binary_for_installer() {
    check_parent_exit(false, false);
}

#[test]
fn abrupt_parent_exit_preserves_external_application_started_by_agent() {
    check_parent_exit(true, false);
}

#[test]
fn explicit_agent_stop_preserves_external_application_started_by_agent() {
    check_parent_exit(true, true);
}

fn check_parent_exit(with_external_application: bool, stop_before_exit: bool) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("target")
        .join(format!(
            "agent-process-qa-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
    fs::create_dir(&root).unwrap();
    let helper = root.join("sep-pi-agent.exe");
    fs::copy(std::env::current_exe().unwrap(), &helper).unwrap();
    let external = root.join("external-app.exe");
    let mut command = Command::new(std::env::current_exe().unwrap());
    if stop_before_exit {
        command.env("SEP_QA_AGENT_STOP", "1");
    }
    if with_external_application {
        fs::copy(std::env::current_exe().unwrap(), &external).unwrap();
        command.env("SEP_QA_EXTERNAL_DIR", &root);
    }
    let mut parent = Parent(
        command
            .args([
                "--exact",
                "parent_exits_without_rust_drop_fixture",
                "--nocapture",
            ])
            .env("SEP_QA_AGENT_HELPER", &helper)
            .creation_flags(HIDE_WINDOW)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .unwrap(),
    );
    let reader = BufReader::new(parent.0.stdout.take().unwrap());
    let ready = reader
        .lines()
        .map_while(Result::ok)
        .any(|line| line.starts_with("QA_AGENT_PID="));
    assert!(ready, "Родитель не запустил агент");
    assert!(
        OpenOptions::new().write(true).open(&helper).is_err(),
        "Работающий exe должен быть заблокирован для замены"
    );
    parent.0.stdin.as_mut().unwrap().write_all(b"x").unwrap();
    assert!(parent.0.wait().unwrap().success());
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        if OpenOptions::new().write(true).open(&helper).is_ok() {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "После exit остался процесс, блокирующий sep-pi-agent.exe"
        );
        thread::sleep(Duration::from_millis(20));
    }
    if with_external_application {
        let external_is_running = OpenOptions::new().write(true).open(&external).is_err();
        // Останавливаем только собственный стенд, включая случай провала проверки.
        fs::write(root.join("external-stop"), b"stop").unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while OpenOptions::new().write(true).open(&external).is_err() {
            assert!(Instant::now() < deadline, "Приложение-стенд не завершилось");
            thread::sleep(Duration::from_millis(20));
        }
        fs::remove_file(&external).unwrap();
        fs::remove_file(root.join("external-ready")).unwrap();
        fs::remove_file(root.join("external-stop")).unwrap();
        fs::remove_file(&helper).unwrap();
        fs::remove_dir(&root).unwrap();
        assert!(
            external_is_running,
            "Выход из Tauri не должен завершать внешние приложения, открытые агентом"
        );
        return;
    }
    fs::remove_file(&helper).unwrap();
    fs::remove_dir(&root).unwrap();
}
