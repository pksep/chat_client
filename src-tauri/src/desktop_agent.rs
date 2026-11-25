use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::Duration,
};
use tauri::{ipc::Channel, Manager, State};
use tauri_plugin_dialog::DialogExt;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(90);
const PROMPT_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const COMMUNICATION_RULES: &str = include_str!("desktop-agent-communication.md");

type Reply = Result<Value, String>;

#[derive(Default)]
pub struct DesktopAgentState {
    operation: Mutex<()>,
    sessions: Mutex<HashMap<String, Arc<AgentSession>>>,
}

impl DesktopAgentState {
    fn session(&self, thread_id: &str) -> Result<Arc<AgentSession>, String> {
        self.sessions
            .lock()
            .map_err(|error| error.to_string())?
            .get(thread_id)
            .cloned()
            .ok_or_else(|| "Выберите папку проекта.".into())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopAgentConnection {
    directory: String,
    session_id: String,
    config_options: Value,
    replay_context: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptAttachment {
    name: String,
    mime_type: String,
    #[serde(flatten)]
    contents: AttachmentContents,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum AttachmentContents {
    Text { text: String },
    Binary { blob: String },
}

impl AttachmentContents {
    fn len(&self) -> usize {
        match self {
            Self::Text { text } => text.len(),
            Self::Binary { blob } => blob.len(),
        }
    }
}

struct AgentSession {
    process: AcpProcess,
    id: Mutex<String>,
    directory: String,
    operation: Mutex<()>,
    config_options: Mutex<Value>,
    output_files: Mutex<HashSet<PathBuf>>,
}

struct AcpProcess {
    child: Child,
    transport: Arc<AcpTransport>,
    next_id: AtomicU64,
}

struct AcpTransport {
    stdin: Mutex<ChildStdin>,
    pending: Mutex<HashMap<u64, mpsc::Sender<Reply>>>,
    permissions: Mutex<HashMap<String, (Value, Value)>>,
    events: Mutex<Option<Channel<Value>>>,
    closed: AtomicBool,
}

impl AcpTransport {
    fn send(&self, message: Value) -> Result<(), String> {
        let mut stdin = self.stdin.lock().map_err(|error| error.to_string())?;
        writeln!(stdin, "{message}")
            .and_then(|_| stdin.flush())
            .map_err(|_| "Потеряна связь с агентом.".into())
    }

    fn answer_permission(&self, request_id: &str, allow: bool) -> Result<(), String> {
        let (id, options) = self
            .permissions
            .lock()
            .map_err(|error| error.to_string())?
            .remove(request_id)
            .ok_or_else(|| "Запрос разрешения уже завершён.".to_string())?;

        let kind = if allow { "allow_once" } else { "reject_once" };
        let option = options.as_array().into_iter().flatten().find_map(|option| {
            (option["kind"] == kind)
                .then(|| option["optionId"].as_str())
                .flatten()
        });
        let outcome = match option {
            Some(option_id) => json!({"outcome": "selected", "optionId": option_id}),
            None => json!({"outcome": "cancelled"}),
        };

        self.send(json!({"jsonrpc": "2.0", "id": id, "result": {"outcome": outcome}}))
    }

    fn event_channel(&self) -> Option<Channel<Value>> {
        self.events.lock().ok()?.clone()
    }

    fn attach_events(&self, events: Channel<Value>) -> Result<(), String> {
        let mut current = self.events.lock().map_err(|error| error.to_string())?;
        if self.closed.load(Ordering::Acquire) {
            return Err("Потеряна связь с агентом.".into());
        }
        *current = Some(events);
        Ok(())
    }

    fn receive(&self, message: Value) {
        let id = &message["id"];
        let events = self.event_channel();

        match message["method"].as_str() {
            Some("session/update") => {
                let Some(events) = events else { return };
                let update = &message["params"]["update"];
                if matches!(
                    update["sessionUpdate"].as_str(),
                    Some(
                        "agent_message_chunk"
                            | "config_option_update"
                            | "tool_call"
                            | "tool_call_update"
                    )
                ) {
                    let _ = events.send(json!({"type": "update", "update": update}));
                }
            }
            Some("session/request_permission") if !id.is_null() && events.is_some() => {
                let Some(events) = events else { return };
                let request_id = id.to_string();
                let params = &message["params"];
                let Ok(mut permissions) = self.permissions.lock() else {
                    return;
                };

                permissions.insert(request_id.clone(), (id.clone(), params["options"].clone()));
                drop(permissions);

                if events
                    .send(json!({
                        "type": "permission",
                        "requestId": request_id,
                        "toolCall": params["toolCall"],
                    }))
                    .is_err()
                {
                    let _ = self.answer_permission(&request_id, false);
                }
            }
            Some(_) if !id.is_null() => {
                let _ = self.send(json!({
                    "jsonrpc": "2.0", "id": id,
                    "error": {"code": -32601, "message": "Method not supported"}
                }));
            }
            None => {
                let Some(id) = id.as_u64() else { return };
                let Ok(mut pending) = self.pending.lock() else {
                    return;
                };

                if let Some(sender) = pending.remove(&id) {
                    let reply = if message["error"].is_null() {
                        Ok(message["result"].clone())
                    } else {
                        let error = match message["error"]["data"].as_str() {
                            Some("provider_config") => "Для подключения агента нужен ключ доступа к ИИ. Обратитесь к администратору.",
                            Some("provider_auth") => "Не удалось подключить агента. Проверьте ключ доступа к ИИ.",
                            Some("provider_access") => "Нет доступа к моделям ИИ. Проверьте права ключа доступа.",
                            Some("provider_limit") => "Достигнут лимит запросов к ИИ. Попробуйте позже.",
                            Some("provider_catalog") => "Нет доступных моделей ИИ для этого подключения.",
                            Some("provider_interrupted") => "Связь с ИИ прервалась до завершения ответа. Если агент мог изменить файлы, проверьте их перед повтором.",
                            Some("provider_request") => "Сервис ИИ временно недоступен. Попробуйте ещё раз.",
                            Some("project_approval") => "Выберите папку проекта ещё раз кнопкой в чате.",
                            _ => "Не удалось выполнить запрос. Попробуйте ещё раз.",
                        };
                        Err(error.into())
                    };
                    let _ = sender.send(reply);
                }
            }
            _ => {}
        }
    }
}

impl AcpProcess {
    fn start(directory: &Path, events: Option<Channel<Value>>) -> Result<Self, String> {
        let file_name = if cfg!(windows) {
            "sep-pi-agent.exe"
        } else {
            "sep-pi-agent"
        };
        let executable = match std::env::var_os("SEP_CHAT_PI_BIN") {
            Some(path) if Path::new(&path).is_absolute() => PathBuf::from(path),
            Some(_) => {
                return Err("Не удалось запустить агент. Проверьте настройки приложения.".into())
            }
            None => std::env::current_exe()
                .map_err(|error| error.to_string())?
                .with_file_name(file_name),
        };

        let mut command = Command::new(executable);
        command
            .env("SEP_CHAT_PI_DATA_DIR", directory)
            .current_dir(directory)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }

        let mut child = command.spawn().map_err(|error| -> String {
            if error.kind() == std::io::ErrorKind::NotFound {
                "Не удалось запустить агент. Попробуйте переустановить приложение.".into()
            } else {
                "Не удалось запустить агент. Попробуйте перезапустить приложение.".into()
            }
        })?;

        let transport = Arc::new(AcpTransport {
            stdin: Mutex::new(child.stdin.take().expect("piped stdin")),
            pending: Mutex::new(HashMap::new()),
            permissions: Mutex::new(HashMap::new()),
            events: Mutex::new(events),
            closed: AtomicBool::new(false),
        });
        let stdout = child.stdout.take().expect("piped stdout");
        let reader = Arc::clone(&transport);

        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if let Ok(message) = serde_json::from_str(&line) {
                    reader.receive(message);
                }
            }

            reader.closed.store(true, Ordering::Release);
            if let Ok(mut pending) = reader.pending.lock() {
                pending.clear();
            }

            if let Some(events) = reader.event_channel() {
                let _ = events.send(json!({"type": "closed"}));
            }
        });

        let process = Self {
            child,
            transport,
            next_id: AtomicU64::new(1),
        };
        let initialized = process.request(
            "initialize",
            json!({
                "protocolVersion": 1,
                "clientCapabilities": {},
                "clientInfo": {"name": "sep-chat", "version": env!("CARGO_PKG_VERSION")}
            }),
            REQUEST_TIMEOUT,
        )?;
        if initialized["protocolVersion"] != 1 {
            return Err("Не удалось подключить агент. Обновите приложение.".into());
        }

        Ok(process)
    }

    fn request(&self, method: &str, params: Value, timeout: Duration) -> Reply {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = mpsc::channel();
        {
            let mut pending = self
                .transport
                .pending
                .lock()
                .map_err(|error| error.to_string())?;
            if self.transport.closed.load(Ordering::Acquire) {
                return Err("Потеряна связь с агентом.".into());
            }
            pending.insert(id, sender);
        }

        let reply = self.transport
            .send(json!({"jsonrpc": "2.0", "id": id, "method": method, "params": params}))
            .and_then(|_| match receiver.recv_timeout(timeout) {
                Ok(reply) => reply,
                Err(mpsc::RecvTimeoutError::Disconnected) => Err("Потеряна связь с агентом.".into()),
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    let _ = self.transport.send(json!({"jsonrpc": "2.0", "method": "$/cancel_request", "params": {"requestId": id}}));
                    Err("Агент не ответил вовремя. Попробуйте ещё раз.".into())
                }
            });

        if let Ok(mut pending) = self.transport.pending.lock() {
            pending.remove(&id);
        }

        reply
    }
}

impl Drop for AcpProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl AgentSession {
    fn id(&self) -> Result<String, String> {
        self.id
            .lock()
            .map(|id| id.clone())
            .map_err(|error| error.to_string())
    }

    fn configure(&self, config_id: &str, value: &str) -> Reply {
        let reply = self.process.request(
            "session/set_config_option",
            json!({"sessionId": self.id()?, "configId": config_id, "value": value}),
            REQUEST_TIMEOUT,
        )?;
        self.store_config_options(&reply)?;
        Ok(reply)
    }

    fn store_config_options(&self, reply: &Value) -> Result<(), String> {
        *self
            .config_options
            .lock()
            .map_err(|error| error.to_string())? = reply["configOptions"].clone();
        Ok(())
    }

    fn connection(&self, replay_context: bool) -> Result<DesktopAgentConnection, String> {
        Ok(DesktopAgentConnection {
            session_id: self.id()?,
            directory: self.directory.clone(),
            config_options: self
                .config_options
                .lock()
                .map_err(|error| error.to_string())?
                .clone(),
            replay_context,
        })
    }
}

fn agent_data_directory(window: &tauri::WebviewWindow) -> Result<PathBuf, String> {
    let directory = window
        .path()
        .app_local_data_dir()
        .map_err(|_| "Не удалось открыть настройки агента.")?
        .join("pi");
    std::fs::create_dir_all(&directory).map_err(|_| "Не удалось открыть настройки агента.")?;
    Ok(directory)
}

fn agent_launch_directory(window: &tauri::WebviewWindow) -> Result<PathBuf, String> {
    let directory = agent_data_directory(window)?;
    let instructions = directory.join("sep-chat-communication.md");
    if std::fs::read_to_string(&instructions).ok().as_deref() != Some(COMMUNICATION_RULES) {
        std::fs::write(instructions, COMMUNICATION_RULES)
            .map_err(|error| format!("Не удалось сохранить правила общения агента: {error}"))?;
    }
    Ok(directory)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentOpenRequest<'a> {
    cwd: &'a str,
    session_id: Option<String>,
    preferred_model: Option<String>,
    require_approved: bool,
    reset_context: bool,
}

fn open_agent_connection(
    state: &DesktopAgentState,
    thread_id: String,
    process: AcpProcess,
    request: AgentOpenRequest<'_>,
) -> Result<DesktopAgentConnection, String> {
    let method = if request.session_id.is_some() {
        "session/resume"
    } else {
        "session/new"
    };
    let opened = process.request(method, json!(request), REQUEST_TIMEOUT)?;
    let id = opened["sessionId"]
        .as_str()
        .ok_or_else(|| "Не удалось открыть чат агента.".to_string())?;
    let session = AgentSession {
        process,
        id: Mutex::new(id.to_owned()),
        directory: request.cwd.to_owned(),
        operation: Mutex::new(()),
        config_options: Mutex::new(opened["configOptions"].clone()),
        output_files: Mutex::default(),
    };
    let connection =
        session.connection(request.session_id.is_some() && opened["restored"] != true)?;
    state
        .sessions
        .lock()
        .map_err(|error| error.to_string())?
        .insert(thread_id, Arc::new(session));

    Ok(connection)
}

#[tauri::command]
pub async fn desktop_agent_models(window: tauri::WebviewWindow) -> Reply {
    tauri::async_runtime::spawn_blocking(move || {
        let directory = agent_data_directory(&window)?;
        let process = AcpProcess::start(&directory, None)?;
        process.request("models/list", json!({}), REQUEST_TIMEOUT)
    })
    .await
    .map_err(|_| "Не удалось загрузить список моделей.".to_string())?
}

#[tauri::command]
pub async fn desktop_agent_translate_notes(
    window: tauri::WebviewWindow,
    state: State<'_, Arc<DesktopAgentState>>,
    thread_id: String,
    texts: Vec<String>,
) -> Reply {
    if texts.is_empty()
        || texts.len() > 16
        || texts
            .iter()
            .any(|s| s.is_empty() || s.chars().count() > 24000)
    {
        return Err("Некорректные пояснения для перевода.".into());
    }
    let session = state
        .session(&thread_id)
        .ok()
        .filter(|s| !s.process.transport.closed.load(Ordering::Acquire));
    tauri::async_runtime::spawn_blocking(move || {
        let params = json!({ "texts": texts });
        if let Some(session) = session {
            return session
                .process
                .request("notes/translate", params, REQUEST_TIMEOUT);
        }
        let directory = agent_data_directory(&window)?;
        AcpProcess::start(&directory, None)?.request("notes/translate", params, REQUEST_TIMEOUT)
    })
    .await
    .map_err(|_| "Не удалось перевести пояснения.".to_string())?
}

#[tauri::command]
pub async fn desktop_agent_pick_directory(
    window: tauri::WebviewWindow,
    state: State<'_, Arc<DesktopAgentState>>,
    events: Channel<Value>,
    thread_id: String,
    preferred_model: Option<String>,
    previous_session: Option<String>,
    previous_directory: Option<String>,
) -> Result<Option<DesktopAgentConnection>, String> {
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = state
            .operation
            .try_lock()
            .map_err(|_| "Дождитесь завершения операции.")?;

        let launch_directory = agent_launch_directory(&window)?;

        // Pi получает рабочую папку проекта при открытии сессии.
        let agent_events = events.clone();
        let warmup_directory = launch_directory.clone();
        let warmup = thread::Builder::new()
            .spawn(move || AcpProcess::start(&warmup_directory, Some(agent_events)))
            .ok();

        let mut dialog = window
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("Выберите папку проекта");
        if let Some(path) = previous_directory.as_ref() {
            dialog = dialog.set_directory(path);
        }
        let Some(folder) = dialog.blocking_pick_folder() else {
            return Ok(None);
        };

        let directory = folder.into_path().map_err(|error| error.to_string())?;
        let cwd = directory
            .to_str()
            .ok_or_else(|| "Путь папки не поддерживается.".to_string())?;
        if !directory.is_absolute() || !directory.is_dir() {
            return Err("Не удалось открыть папку проекта.".into());
        }

        events
            .send(json!({"type": "directory_selected", "directory": cwd}))
            .map_err(|_| "Окно агента закрыто.")?;
        let process = match warmup {
            Some(task) => task.join().map_err(|_| "Не удалось запустить агент.")??,
            None => AcpProcess::start(&launch_directory, Some(events))?,
        };

        let resume_id = previous_session.filter(|_| previous_directory.as_deref() == Some(cwd));
        let request = AgentOpenRequest {
            cwd,
            session_id: resume_id,
            preferred_model,
            require_approved: false,
            reset_context: false,
        };
        open_agent_connection(&state, thread_id, process, request).map(Some)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn desktop_agent_resume_directory(
    window: tauri::WebviewWindow,
    state: State<'_, Arc<DesktopAgentState>>,
    events: Channel<Value>,
    thread_id: String,
    directory: String,
    previous_session: String,
    preferred_model: Option<String>,
    reset_context: bool,
) -> Result<DesktopAgentConnection, String> {
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = state
            .operation
            .try_lock()
            .map_err(|_| "Дождитесь завершения операции.")?;

        let path = Path::new(&directory);
        if !path.is_absolute() || !path.is_dir() {
            return Err(
                "Сохранённая папка недоступна. Подключите диск или выберите другую папку.".into(),
            );
        }

        if let Some(session) = state.session(&thread_id).ok().filter(|session| {
            !reset_context
                && session.directory == directory
                && !session.process.transport.closed.load(Ordering::Acquire)
        }) {
            let _prompt = session
                .operation
                .try_lock()
                .map_err(|_| "Дождитесь завершения операции.")?;
            if session.id()? == previous_session {
                session.process.transport.attach_events(events)?;
                return session.connection(false);
            }
        }

        let launch_directory = agent_launch_directory(&window)?;
        let process = AcpProcess::start(&launch_directory, Some(events))?;
        let request = AgentOpenRequest {
            cwd: &directory,
            session_id: Some(previous_session),
            preferred_model,
            require_approved: true,
            reset_context,
        };
        open_agent_connection(&state, thread_id, process, request)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn desktop_agent_configure(
    state: State<'_, Arc<DesktopAgentState>>,
    thread_id: String,
    config_id: String,
    value: String,
) -> Reply {
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let session = state.session(&thread_id)?;
        let _operation = session
            .operation
            .try_lock()
            .map_err(|_| "Дождитесь завершения операции.")?;

        match config_id.as_str() {
            "model" | "effort" => {}
            _ => return Err("Эта настройка агента недоступна.".into()),
        }

        Ok(session.configure(&config_id, &value)?["configOptions"].clone())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn desktop_agent_prompt(
    state: State<'_, Arc<DesktopAgentState>>,
    thread_id: String,
    text: String,
    history_context: Option<String>,
    attachments: Option<Vec<PromptAttachment>>,
) -> Reply {
    let attachments = attachments.unwrap_or_default();
    if attachments.len() > 10
        || attachments
            .iter()
            .map(|file| file.contents.len())
            .sum::<usize>()
            > 14 * 1024 * 1024
    {
        return Err(
            "Не удалось передать вложения агенту. Проверьте количество и размер файлов.".into(),
        );
    }

    let mut prompt = vec![json!({"type": "text", "text": text})];
    if let Some(context) = history_context {
        if context.len() > 160_000 {
            return Err("История слишком велика для восстановления контекста.".into());
        }
        prompt.push(
            json!({"type": "text", "text": context, "annotations": {"audience": ["assistant"]}}),
        );
    }
    for (index, attachment) in attachments.into_iter().enumerate() {
        let filename = Path::new(&attachment.name);
        if filename.file_name() != Some(filename.as_os_str()) || attachment.name.len() > 1024 {
            return Err("Некорректное название вложения.".into());
        }

        // Веб-редактор передаёт байты файла без исходного пути. ACP использует URI как имя ресурса.
        let path = std::env::temp_dir()
            .join("sep-chat-attachments")
            .join(index.to_string())
            .join(filename);
        let uri = tauri::Url::from_file_path(path)
            .map_err(|_| "Не удалось подготовить название вложения.")?;
        let resource = match attachment.contents {
            AttachmentContents::Text { text } => {
                json!({"uri": uri.as_str(), "mimeType": attachment.mime_type, "text": text})
            }
            AttachmentContents::Binary { blob } => {
                json!({"uri": uri.as_str(), "mimeType": attachment.mime_type, "blob": blob})
            }
        };

        prompt.push(json!({"type": "resource", "resource": resource}));
    }

    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let session = state.session(&thread_id)?;
        let _operation = session
            .operation
            .try_lock()
            .map_err(|_| "Дождитесь завершения операции.")?;
        let reply = session.process.request(
            "session/prompt",
            json!({"sessionId": session.id()?, "prompt": prompt}),
            PROMPT_TIMEOUT,
        );

        if let Ok(mut permissions) = session.process.transport.permissions.lock() {
            permissions.clear();
        }

        if let Ok(result) = &reply {
            let mut allowed = session.output_files.lock().map_err(|e| e.to_string())?;
            if let Some(files) = result["outputFiles"].as_array() {
                allowed.extend(
                    files
                        .iter()
                        .filter(|file| file["linkOnly"] != true)
                        .filter_map(|file| file["path"].as_str())
                        .map(PathBuf::from),
                );
            }
        }
        reply
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn desktop_agent_read_image(
    state: State<'_, Arc<DesktopAgentState>>,
    thread_id: String,
    path: PathBuf,
) -> Result<tauri::ipc::Response, String> {
    read_project_output(state, thread_id, path, true).await
}

#[tauri::command]
pub async fn desktop_agent_read_output(
    state: State<'_, Arc<DesktopAgentState>>,
    thread_id: String,
    path: PathBuf,
) -> Result<tauri::ipc::Response, String> {
    read_project_output(state, thread_id, path, false).await
}

async fn read_project_output(
    state: State<'_, Arc<DesktopAgentState>>,
    thread_id: String,
    path: PathBuf,
    image_only: bool,
) -> Result<tauri::ipc::Response, String> {
    let session = state.session(&thread_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        if !session
            .output_files
            .lock()
            .map_err(|e| e.to_string())?
            .contains(&path)
        {
            return Err("Файл отсутствует в результатах этого проекта.".into());
        }
        let root =
            std::fs::canonicalize(&session.directory).map_err(|_| "Папка проекта недоступна.")?;
        let actual = std::fs::canonicalize(&path).map_err(|_| "Файл перемещён или удалён.")?;
        if !actual.starts_with(root) {
            return Err("Файл находится за пределами проекта.".into());
        }
        let extension = actual
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if image_only && !matches!(
            extension.as_str(),
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "avif" | "bmp"
        ) {
            return Err("Этот файл нельзя отправить как фотографию.".into());
        }
        let file = std::fs::File::open(actual).map_err(|_| "Не удалось открыть файл.")?;
        const MAX_BYTES: u64 = 50 * 1024 * 1024;
        let meta = file.metadata().map_err(|_| "Не удалось проверить файл.")?;
        if !meta.is_file() || meta.len() > MAX_BYTES {
            return Err("Размер сохраняемого файла должен быть до 50 МБ.".into());
        }
        let mut bytes = Vec::with_capacity(meta.len() as usize);
        file.take(MAX_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "Не удалось прочитать файл.")?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err("Файл больше 50 МБ.".into());
        }
        Ok(tauri::ipc::Response::new(bytes))
    })
    .await
    .map_err(|_| "Не удалось подготовить файл.".to_string())?
}

#[tauri::command]
pub async fn desktop_agent_reset(
    state: State<'_, Arc<DesktopAgentState>>,
    thread_id: String,
) -> Result<DesktopAgentConnection, String> {
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let session = state.session(&thread_id)?;
        let _operation = session
            .operation
            .try_lock()
            .map_err(|_| "Дождитесь завершения операции.")?;
        let opened = session.process.request(
            "session/new",
            json!({"cwd": session.directory, "mcpServers": []}),
            REQUEST_TIMEOUT,
        )?;
        let session_id = opened["sessionId"]
            .as_str()
            .ok_or_else(|| "Не удалось открыть чат агента.".to_string())?
            .to_owned();
        *session.id.lock().map_err(|error| error.to_string())? = session_id;
        session.store_config_options(&opened)?;
        session.connection(true)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn desktop_agent_cancel(
    state: State<'_, Arc<DesktopAgentState>>,
    thread_id: String,
) -> Result<(), String> {
    let session = state.session(&thread_id)?;
    session.process.transport.send(json!({
        "jsonrpc": "2.0", "method": "session/cancel", "params": {"sessionId": session.id()?}
    }))
}

#[tauri::command]
pub fn desktop_agent_answer_permission(
    state: State<'_, Arc<DesktopAgentState>>,
    thread_id: String,
    request_id: String,
    allow: bool,
) -> Result<(), String> {
    state
        .session(&thread_id)?
        .process
        .transport
        .answer_permission(&request_id, allow)
}

#[tauri::command]
pub fn desktop_agent_disconnect(
    state: State<'_, Arc<DesktopAgentState>>,
    thread_id: String,
) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .map_err(|error| error.to_string())?
        .remove(&thread_id);
    if let Some(session) = session {
        let _ = session.process.transport.send(json!({
            "jsonrpc": "2.0", "method": "session/cancel", "params": {"sessionId": session.id()?}
        }));
    }

    Ok(())
}
