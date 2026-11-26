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
        thread::sleep(Duration::from_secs(60));
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
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    desktop_agent_process::attach(&mut child).unwrap();
    println!("QA_AGENT_PID={}", child.id());
    std::io::stdout().flush().unwrap();
    let mut trigger = [0];
    std::io::stdin().read_exact(&mut trigger).unwrap();
    // Повторяет exit updater: Rust Drop и Tauri callback не выполняются.
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
    let mut parent = Parent(
        Command::new(std::env::current_exe().unwrap())
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
    fs::remove_file(&helper).unwrap();
    fs::remove_dir(&root).unwrap();
}
