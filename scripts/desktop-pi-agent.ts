import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createReasoningSummaryReporter } from './desktop-agent-reasoning-summary';
import type { AgentWorkEntry } from '../src/types/agent-work';
import { Type } from 'typebox';
import {
  clampThinkingLevel,
  getSupportedThinkingLevels
} from '@earendil-works/pi-ai/compat';
import {
  type AgentSession,
  type AgentSessionEvent,
  type ExtensionFactory,
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager
} from '@earendil-works/pi-coding-agent';
type Image = NonNullable<
  NonNullable<Parameters<AgentSession['prompt']>[1]>['images']
>[number];
type PromptPart =
  | { type: 'text'; text: string }
  | {
      type: 'resource';
      resource: { uri: string; mimeType: string; text?: string; blob?: string };
    };
type Request = {
  id?: number;
  method: string;
  params?: {
    cwd?: string;
    sessionId?: string;
    preferredModel?: string;
    requireApproved?: boolean;
    resetContext?: boolean;
    configId?: string;
    value?: string;
    prompt?: PromptPart[];
    requestId?: number;
    texts?: string[];
  };
};
type PermissionReply = {
  id: string;
  result?: { outcome?: { outcome: string; optionId?: string } };
};
type ConfigChoice = { value: string; name: string };
type SessionConfig = {
  id: 'model' | 'effort';
  category: 'model' | 'thought_level';
  currentValue: string;
  options: ConfigChoice[];
};

const provider = 'codex-lb';
const providerUrl = 'https://codex-lb.pksep.ru/v1';

class AgentError extends Error {
  constructor(
    readonly reason:
      | 'provider_auth'
      | 'provider_access'
      | 'provider_limit'
      | 'provider_interrupted'
      | 'provider_request'
      | 'provider_config'
      | 'provider_catalog'
      | 'project_approval'
  ) {
    super(reason);
  }
}

const effortLabels: Record<string, string> = {
  off: 'Обычный',
  minimal: 'Минимальный',
  low: 'Лёгкий',
  medium: 'Средний',
  high: 'Высокий',
  xhigh: 'Очень высокий',
  max: 'Максимальный'
};

const agentDir = process.env.SEP_CHAT_PI_DATA_DIR;
if (!agentDir || !isAbsolute(agentDir))
  throw new Error('Missing Pi data directory');

const shell = process.platform === 'win32' ? 'powershell' : 'bash';
const tools = ['read', 'ls', 'edit', 'write', 'share_file', shell];
const titles: Record<string, string> = {
  read: 'Читаю файл',
  ls: 'Смотрю содержимое папки',
  write: 'Записываю файл',
  edit: 'Изменяю файл',
  share_file: 'Прикрепляю файл к ответу',
  bash: 'Выполняю команду',
  powershell: 'Выполняю команду'
};

let session: AgentSession | undefined;
let promptId: number | undefined;
let cancelled = false;
let sequence = 0;
const pendingPermissions = new Map<string, (allow: boolean) => void>();

function send(message: object): void {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
}

function update(value: object): void {
  send({ method: 'session/update', params: { update: value } });
}

function isInside(directory: string, path: string): boolean {
  const difference = relative(directory, path);
  return (
    difference !== '..' &&
    !difference.startsWith('..' + sep) &&
    !isAbsolute(difference)
  );
}

function getToolPath(input: string, cwd: string): string {
  let path = input
    .replace(/^@/, '')
    .replace(/[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g, ' ');
  if (process.platform === 'win32' && !path.includes('\\')) {
    path = path.replace(/^\/(?:mnt\/|cygdrive\/)?([a-z])(?=\/|$)/i, '$1:');
  }

  if (path.startsWith('file://')) return fileURLToPath(path);

  return resolve(cwd, path.replace(/^~(?=[\\/]|$)/, homedir()));
}

function permissionExtension(cwd: string): ExtensionFactory {
  return (pi): void => {
    pi.registerTool({
      name: 'share_file',
      label: titles.share_file,
      description:
        'Приложить существующий файл проекта к ответу. Изображение появится в чате как фотография. Для файла, созданного через write, это происходит автоматически.',
      parameters: Type.Object({ path: Type.String() }),
      async execute(
        _id,
        { path }
      ): Promise<{
        content: { type: 'text'; text: string }[];
        details: undefined;
      }> {
        const actual = await realpath(getToolPath(path, cwd));
        if (!isInside(cwd, actual) || !(await stat(actual)).isFile()) {
          throw new Error('Выберите файл в папке проекта.');
        }
        return {
          content: [{ type: 'text', text: 'Файл выбран для ответа.' }],
          details: undefined
        };
      }
    });
    pi.on('tool_call', async event => {
      if (cancelled) return { block: true, reason: 'Действие отменено.' };
      if (!tools.includes(event.toolName))
        return { block: true, reason: 'Инструмент недоступен.' };

      const path =
        'path' in event.input && typeof event.input.path === 'string'
          ? getToolPath(event.input.path, cwd)
          : undefined;
      if (event.toolName === 'read' || event.toolName === 'ls') {
        const actualPath = await realpath(path ?? cwd).catch(() => null);
        if (actualPath && isInside(cwd, actualPath)) {
          event.input.path = actualPath;
          return;
        }
      }

      const command =
        'command' in event.input && typeof event.input.command === 'string'
          ? event.input.command
          : undefined;
      const id = 'permission-' + ++sequence;
      const allowed = await new Promise<boolean>(done => {
        if (cancelled) {
          done(false);
          return;
        }

        pendingPermissions.set(id, done);
        send({
          id,
          method: 'session/request_permission',
          params: {
            options: [
              { optionId: 'allow', kind: 'allow_once' },
              { optionId: 'deny', kind: 'reject_once' }
            ],
            toolCall: {
              title: command ?? titles[event.toolName],
              locations: path ? [{ path }] : []
            }
          }
        });
      });

      if (!allowed || cancelled)
        return { block: true, reason: 'Действие не подтверждено.' };
    });
  };
}

let modelRuntime: ModelRuntime | undefined;

async function createModelRuntime(directory: string): Promise<ModelRuntime> {
  const key =
    process.env.SEP_CHAT_CODEX_API_KEY?.trim() ||
    (
      await readFile(join(directory, 'codex-api-key.txt'), 'utf8').catch(
        (error: NodeJS.ErrnoException): string => {
          if (error.code === 'ENOENT') return '';
          throw error;
        }
      )
    ).trim();
  if (!key) throw new AgentError('provider_config');
  delete process.env.SEP_CHAT_CODEX_API_KEY;

  const response = await fetch(providerUrl + '/models', {
    headers: { Authorization: 'Bearer ' + key },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000)
  }).catch((): never => {
    throw new AgentError('provider_request');
  });
  if (!response.ok) throw providerError(String(response.status));

  const payload: { data?: unknown } = await response.json();
  const ids = Array.isArray(payload?.data)
    ? [
        ...new Set(
          payload.data
            .map((entry: { id?: unknown } | null): unknown => entry?.id)
            .filter(
              (id): id is string =>
                typeof id === 'string' && /^[\w][\w.\/:-]{0,127}$/.test(id)
            )
        )
      ]
    : [];
  if (!ids.length) throw new AgentError('provider_catalog');

  const runtime = await ModelRuntime.create({
    authPath: join(directory, 'auth.json'),
    modelsPath: null,
    refreshOnCreate: false
  });
  runtime.registerProvider(provider, {
    baseUrl: providerUrl,
    api: 'openai-responses',
    models: ids.map(id => {
      const known = runtime.getModel('openai', id);

      return {
        id,
        name: known?.name ?? id,
        input: known?.input ?? ['text'],
        reasoning: known?.reasoning ?? false,
        thinkingLevelMap: known?.thinkingLevelMap,
        contextWindow: known?.contextWindow ?? 32_768,
        maxTokens: known?.maxTokens ?? 4_096,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      };
    })
  });
  await runtime.setRuntimeApiKey(provider, key);

  return runtime;
}

function isUnavailableAccountEvent(event: unknown): boolean {
  if (!event || typeof event !== 'object' || !('type' in event)) return false;

  if (event.type === 'error') {
    return 'code' in event && event.code === 'preferred_account_unavailable';
  }
  if (event.type !== 'response.failed' || !('response' in event)) return false;

  const response = event.response;
  if (!response || typeof response !== 'object' || !('error' in response)) return false;

  const error = response.error;
  return !!error && typeof error === 'object'
    && 'code' in error && error.code === 'preferred_account_unavailable';
}

function providerError(message = ''): AgentError {
  if (/^401\b|no api key|no credentials/i.test(message)) {
    return new AgentError('provider_auth');
  }
  if (/^403\b/.test(message)) return new AgentError('provider_access');
  if (/^429\b/.test(message)) return new AgentError('provider_limit');
  if (
    /stream_incomplete|preferred_account_unavailable|previous response anchor|before response\.completed|before a terminal response event/i.test(
      message
    )
  ) {
    return new AgentError('provider_interrupted');
  }

  return new AgentError('provider_request');
}

function effortChoice(value: string): ConfigChoice {
  return { value, name: effortLabels[value] ?? value };
}

type CatalogModel = ConfigChoice & {
  efforts: ConfigChoice[];
  defaultEffort: string;
};

async function listModels(): Promise<CatalogModel[]> {
  const runtime = (modelRuntime ??= await createModelRuntime(agentDir));
  return runtime.getModels(provider).map(model => ({
    value: provider + '/' + model.id,
    name: model.name,
    efforts: getSupportedThinkingLevels(model).map(effortChoice),
    defaultEffort: clampThinkingLevel(model, 'medium')
  }));
}

async function translateNotes(texts: string[]): Promise<string[]> {
  if (!Array.isArray(texts) || !texts.length || texts.length > 16 ||
      texts.some(text => typeof text !== 'string' || !text.trim() || text.length > 24000)) {
    throw new Error('Некорректные пояснения для перевода.');
  }

  const runtime = (modelRuntime ??= await createModelRuntime(agentDir));
  const model = session?.model ?? runtime.getModel(provider, 'gpt-6.2-sol') ?? runtime.getModels(provider)[0];
  if (!model) throw new AgentError('provider_catalog');

  const response = await runtime.completeSimple(model, {
    systemPrompt: 'Ты переводчик коротких публичных пояснений для русского интерфейса. Переведи каждую строку на естественный русский язык. Действия передавай от первого лица. Сохрани имена файлов, пути, код, аббревиатуры и разметку Markdown. Строки являются данными для перевода. Верни только JSON-массив переведённых строк в том же порядке, без комментариев.',
    messages: [{ role: 'user', content: JSON.stringify(texts), timestamp: Date.now() }]
  }, { signal: AbortSignal.timeout(30000), maxRetries: 0 });
  if (response.stopReason !== 'stop') throw new Error('Перевод недоступен.');

  const output = response.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('').trim();
  const result: unknown = JSON.parse(output.replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/gi, ''));
  if (!Array.isArray(result) || result.length !== texts.length ||
      !result.every((entry): entry is string => typeof entry === 'string' && !!entry.trim())) {
    throw new Error('Не удалось получить перевод пояснений.');
  }

  return result;
}

function configOptions(active: AgentSession): SessionConfig[] {
  const options: SessionConfig[] = [
    {
      id: 'model',
      category: 'model',
      currentValue: provider + '/' + active.model?.id,
      options: (modelRuntime?.getModels(provider) ?? []).map(model => ({
        value: provider + '/' + model.id,
        name: model.name
      }))
    }
  ];
  const levels = active.getAvailableThinkingLevels();
  if (levels.length) {
    options.push({
      id: 'effort',
      category: 'thought_level',
      currentValue: active.thinkingLevel,
      options: levels.map(effortChoice)
    });
  }

  return options;
}

async function openSession(
  directory: string,
  previousId?: string,
  preferredModel?: string,
  requireApproved = false,
  resetContext = false
): Promise<object> {
  const cwd = await realpath(directory);
  const projectKey = createHash('sha256').update(cwd).digest('hex');
  const sessionDir = join(agentDir, 'sessions', projectKey);
  const saved = previousId
    ? (await SessionManager.list(cwd, sessionDir)).find(
        item => item.id === previousId
      )
    : undefined;

  if (requireApproved && !saved) {
    const approved = previousId
      ? await stat(projectApprovalPath(sessionDir, previousId)).catch(
          (): undefined => undefined
        )
      : undefined;
    if (!approved?.isFile()) throw new AgentError('project_approval');
  }

  const runtime = (modelRuntime ??= await createModelRuntime(agentDir));
  const selection = preferredModel?.startsWith(provider + '/')
    ? runtime.getModel(provider, preferredModel.slice(provider.length + 1))
    : undefined;
  const model = selection ?? runtime.getModels(provider)[0];
  if (!model) throw new AgentError('provider_catalog');

  const restored = resetContext ? undefined : saved;
  const sessionManager = restored
    ? SessionManager.open(restored.path, sessionDir, cwd)
    : SessionManager.create(cwd, sessionDir);
  const settingsManager = SettingsManager.inMemory();
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    disabledBuiltinExtensions: ['mcp', 'codemode'],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    extensionFactories: [permissionExtension(cwd)],
    appendSystemPrompt: [
      await readFile(join(agentDir, 'sep-chat-communication.md'), 'utf8')
    ]
  });

  await resourceLoader.reload();
  const next = await createAgentSession({
    cwd,
    agentDir,
    modelRuntime: runtime,
    model,
    tools,
    sessionManager,
    settingsManager,
    resourceLoader
  });

  if (!restored) {
    await mkdir(sessionDir, { recursive: true });
    await writeFile(
      projectApprovalPath(sessionDir, sessionManager.getSessionId()),
      '',
      { mode: 0o600 }
    );
  }

  session?.dispose();
  session = next.session;
  // Для codex-lb ключ кэша привязывает запрос к WebSocket. Pi уже передаёт
  // историю и результаты инструментов из локального SessionManager при каждом шаге.
  session.agent.sessionId = undefined;

  return {
    sessionId: sessionManager.getSessionId(),
    configOptions: configOptions(session),
    restored: Boolean(restored)
  };
}

function projectApprovalPath(sessionDir: string, id: string): string {
  const key = createHash('sha256').update(id).digest('hex');
  return join(sessionDir, key + '.approved');
}

function isPublicCommentary(signature?: string): boolean {
  if (!signature?.startsWith('{')) return false;
  try {
    return JSON.parse(signature)?.phase === 'commentary';
  } catch {
    return false;
  }
}

async function configure(
  active: AgentSession,
  configId: string,
  value: string
): Promise<object> {
  if (configId === 'model' && value.startsWith(provider + '/')) {
    const model = modelRuntime?.getModel(
      provider,
      value.slice(provider.length + 1)
    );
    if (!model) throw new Error('Model unavailable');
    await active.setModel(model);
  } else if (configId === 'effort') {
    const level = active
      .getAvailableThinkingLevels()
      .find(item => item === value);
    if (!level) throw new Error('Invalid reasoning level');
    active.setThinkingLevel(level);
  } else {
    throw new Error('Invalid configuration');
  }

  return { configOptions: configOptions(active) };
}

async function runPrompt(
  active: AgentSession,
  parts: PromptPart[]
): Promise<object> {
  cancelled = false;
  let attachmentDir: string | undefined;
  let failure: AgentError | undefined;
  let responseText = '';
  let stage = '';
  let receivedChars = 0;
  let lastReportAt = 0;
  const pendingFiles = new Map<string, string>();
  const outputPaths = new Set<string>();
  const workLog = new Map<string, AgentWorkEntry>();
  const actionNames = new Map<string, string>();
  let commentaryIndex = 0;

  function publish(entry: AgentWorkEntry, fields: object = {}): void {
    workLog.set(entry.id, entry);
    update({ sessionUpdate: 'tool_call_update', workEntry: entry, ...fields });
  }

  const progress = createReasoningSummaryReporter(summary => {
    publish({ id: 'summary:' + summary.id, kind: 'summary', text: summary.text }, { reasoningSummary: summary });
  });
  const previousStreamHandler = active.agent.onProviderStreamEvent;
  active.agent.onProviderStreamEvent = async (data, model): Promise<void> => {
    await previousStreamHandler?.(data, model);
    if (!cancelled && model.api === 'openai-responses') {
      // Штатный повтор Pi продолжает с последнего результата инструмента.
      if (model.provider === provider && isUnavailableAccountEvent(data)) {
        throw new Error('Service temporarily unavailable: preferred_account_unavailable');
      }
      progress.receiveEvent(data);
    }
  };

  function report(title: string, newChars = 0): void {
    const changed = title !== stage;
    stage = title;
    receivedChars = (changed ? 0 : receivedChars) + newChars;
    const now = Date.now();
    if (!changed && now - lastReportAt < 1_000) return;

    lastReportAt = now;
    update({ sessionUpdate: 'tool_call_update', title, receivedChars });
  }

  const unsubscribe = active.subscribe((event: AgentSessionEvent): void => {
    if (event.type === 'message_start' && event.message.role === 'assistant') {
      report('Жду ответа модели');
    } else if (event.type === 'message_update') {
      const part = event.assistantMessageEvent;
      if (part.type === 'thinking_start' || part.type === 'thinking_delta') {
        report('Обдумываю запрос');
      } else if (part.type === 'text_delta') {
        report('Формулирую ответ', part.delta.length);
      } else if (part.type === 'text_end') {
        const block = part.partial.content[part.contentIndex];
        if (block?.type === 'text' && isPublicCommentary(block.textSignature)) {
          const note = part.content.trim();
          if (note) publish({ id: 'note:' + ++commentaryIndex, kind: 'commentary', text: note }, { commentary: note });
        }
      } else if (
        part.type === 'toolcall_start' ||
        part.type === 'toolcall_delta'
      ) {
        const tool = part.partial.content[part.contentIndex];
        if (tool?.type !== 'toolCall') return;

        const title =
          tool.name === 'write'
            ? 'Готовлю содержимое файла'
            : tool.name === 'edit'
              ? 'Готовлю изменения файла'
              : 'Готовлю действие';
        report(title, part.type === 'toolcall_delta' ? part.delta.length : 0);
      }
    } else if (event.type === 'auto_retry_start') {
      update({ sessionUpdate: 'tool_call_update', commentary: '' });
      report(
        `Восстанавливаю связь с ИИ (попытка ${event.attempt} из ${event.maxAttempts})`
      );
    } else if (
      event.type === 'tool_execution_start' ||
      event.type === 'tool_execution_update'
    ) {
      const title = titles[event.toolName] ?? 'Выполняю действие';
      const path: unknown = event.args?.path;
      if (
        event.type === 'tool_execution_start' &&
        typeof path === 'string' &&
        ['write', 'edit', 'share_file'].includes(event.toolName)
      ) {
        pendingFiles.set(event.toolCallId, path);
      }
      const name =
        typeof path === 'string' ? basename(path.replaceAll('\\', '/')) : '';
      if (event.type === 'tool_execution_start') {
        actionNames.set(event.toolCallId, name);
        publish({ id: 'action:' + event.toolCallId, kind: 'action', state: 'running', text: name ? title + ' · ' + name : title });
      }
      report(name ? `${title} · ${name}` : title);
    } else if (event.type === 'tool_execution_end') {
      const completed: Record<string, string> = {
        read: 'Прочитал файл', ls: 'Просмотрел папку', write: 'Записал файл',
        edit: 'Изменил файл', share_file: 'Подготовил вложение', bash: 'Выполнил команду', powershell: 'Выполнил команду'
      };
      const name = actionNames.get(event.toolCallId);
      const title = event.isError ? 'Действие завершилось с ошибкой' : completed[event.toolName] ?? 'Выполнил действие';
      publish({ id: 'action:' + event.toolCallId, kind: 'action', state: event.isError ? 'failed' : 'done', text: name ? title + ' · ' + name : title });
      const path = pendingFiles.get(event.toolCallId);
      pendingFiles.delete(event.toolCallId);
      if (!event.isError && path) outputPaths.add(path);
      if (event.isError) report('Действие завершилось с ошибкой');
      else if (event.toolName === 'write' || event.toolName === 'edit')
        report('Изменения записаны');
      else report('Получен результат действия');
    } else if (event.type === 'agent_end' && !event.willRetry) {
      const lastReply = event.messages.findLast(
        message => message.role === 'assistant'
      );
      failure = undefined;
      responseText = '';

      if (lastReply?.stopReason === 'error') {
        failure = providerError(lastReply.errorMessage);
      } else if (lastReply?.stopReason === 'stop') {
        const text = lastReply.content.filter(block => block.type === 'text');
        const finalText = text.filter(
          block => !isPublicCommentary(block.textSignature)
        );
        responseText = (finalText.length ? finalText : text)
          .map(block => block.text)
          .join('\n\n')
          .trim();
      }
    }
  });

  try {
    const text: string[] = [];
    const images: Image[] = [];
    for (const part of parts) {
      if (part.type === 'text') {
        text.push(part.text);
        continue;
      }

      const { uri, mimeType, blob } = part.resource;
      const name = basename(fileURLToPath(uri));
      if (part.resource.text !== undefined) {
        text.push('Вложение ' + name + ':\n' + part.resource.text);
      } else if (
        blob &&
        ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(
          mimeType
        ) &&
        active.model?.input.includes('image')
      ) {
        images.push({ type: 'image', mimeType, data: blob });
      } else if (blob) {
        if (!attachmentDir) {
          const attachments = join(agentDir, 'attachments');
          await mkdir(attachments, { recursive: true });
          attachmentDir = await mkdtemp(join(attachments, 'prompt-'));
        }

        const path = join(attachmentDir, String(text.length) + '-' + name);
        await writeFile(path, Buffer.from(blob, 'base64'), { flag: 'wx' });
        text.push(
          'Вложение ' + name + '. Путь к копии файла на время ответа: ' + path
        );
      }
    }

    if (!cancelled) {
      try {
        await active.prompt(text.join('\n\n'), {
          images,
          source: 'rpc',
          expandPromptTemplates: false
        });
      } catch (error) {
        if (!cancelled) {
          if (error instanceof Error) {
            const cause = providerError(error.message);
            if (
              cause.reason === 'provider_auth' ||
              cause.reason === 'provider_interrupted'
            ) {
              throw cause;
            }
          }
          throw error;
        }
      }
      if (failure && !cancelled) throw failure;
    }

    const outputFiles = new Map<
      string,
      { path: string; relativePath: string; linkOnly?: boolean }
    >();
    const cwd = active.sessionManager.getCwd();
    // В ответах о поиске агент может назвать файл, не меняя и не отправляя его.
    const mentionedPaths = new Set<string>();
    for (const match of responseText.matchAll(
      /`([^`\r\n]+)`|\]\(<?([^()<>\r\n]+)>?\)/g
    )) {
      const path = (match[1] ?? match[2]).trim();
      if (/\.[\p{L}\d_-]+$/u.test(path) && !/^[a-z][a-z\d+.-]+:/i.test(path))
        mentionedPaths.add(path);
    }
    for (const path of new Set([...outputPaths, ...mentionedPaths])) {
      const candidate = getToolPath(path, cwd);
      if (!isInside(cwd, candidate)) continue;
      const actual = await realpath(candidate).catch(() => null);
      if (
        actual &&
        !outputFiles.has(actual) &&
        isInside(cwd, actual) &&
        (await stat(actual).catch(() => null))?.isFile()
      ) {
        outputFiles.set(actual, {
          path: actual,
          relativePath: relative(cwd, actual),
          ...(outputPaths.has(path) ? {} : { linkOnly: true })
        });
      }
    }

    return {
      stopReason: cancelled ? 'cancelled' : 'end_turn',
      outputFiles: cancelled ? [] : [...outputFiles.values()],
      responseText: cancelled ? '' : responseText,
      workLog: [...workLog.values()],
      reasoningSummaries: progress.summaries()
    };
  } finally {
    active.agent.onProviderStreamEvent = previousStreamHandler;
    unsubscribe();
    if (attachmentDir)
      await rm(attachmentDir, { recursive: true, force: true }).catch(
        () => undefined
      );
  }
}

async function cancel(): Promise<void> {
  cancelled = true;
  for (const answer of pendingPermissions.values()) answer(false);
  pendingPermissions.clear();
  await session?.abort();
}

async function handle(request: Request): Promise<object> {
  const params = request.params ?? {};
  if (request.method === 'initialize') return { protocolVersion: 1 };
  if (request.method === 'models/list') return { models: await listModels() };
  if (request.method === 'notes/translate') return translateNotes(params.texts ?? []);
  if (request.method === '$/cancel_request') {
    if (promptId !== undefined && promptId === params.requestId) await cancel();
    return {};
  }
  if (request.method === 'session/cancel') {
    if (params.sessionId === session?.sessionManager.getSessionId())
      await cancel();
    return {};
  }
  if (promptId !== undefined) throw new Error('Prompt already running');
  if (
    (request.method === 'session/new' || request.method === 'session/resume') &&
    params.cwd
  ) {
    return openSession(
      params.cwd,
      request.method === 'session/resume' ? params.sessionId : undefined,
      params.preferredModel ??
        (session?.model ? provider + '/' + session.model.id : undefined),
      params.requireApproved,
      params.resetContext
    );
  }
  if (!session || session.sessionManager.getSessionId() !== params.sessionId) {
    throw new Error('Session unavailable');
  }
  if (
    request.method === 'session/set_config_option' &&
    params.configId &&
    params.value
  ) {
    return configure(session, params.configId, params.value);
  }
  if (
    request.method === 'session/prompt' &&
    request.id !== undefined &&
    params.prompt
  ) {
    promptId = request.id;
    try {
      return await runPrompt(session, params.prompt);
    } finally {
      promptId = undefined;
    }
  }

  throw new Error('Unsupported request');
}

async function receive(line: string): Promise<void> {
  const message = JSON.parse(line) as Request | PermissionReply;
  if (!('method' in message)) {
    const outcome = message.result?.outcome;
    const answer = pendingPermissions.get(message.id);
    pendingPermissions.delete(message.id);
    answer?.(outcome?.outcome === 'selected' && outcome.optionId === 'allow');
    return;
  }

  try {
    const result = await handle(message);
    if (message.id !== undefined) send({ id: message.id, result });
  } catch (error) {
    if (process.env.SEP_CHAT_PI_DIAGNOSTICS === '1') {
      console.error(
        error instanceof Error
          ? error.message.split('\n')[0]
          : 'Pi request failed'
      );
    }

    if (message.id !== undefined) {
      send({
        id: message.id,
        error: {
          code: -32000,
          message: 'Pi request failed',
          data: error instanceof AgentError ? error.reason : undefined
        }
      });
    }
  }
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line): void => {
  void receive(line).catch(() => undefined);
});
input.on('close', (): void => {
  void cancel().finally(() => process.exit());
});
