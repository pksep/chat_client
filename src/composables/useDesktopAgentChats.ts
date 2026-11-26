import { Channel, invoke } from '@tauri-apps/api/core';
import { reactive, shallowReactive } from 'vue';
import { getAiErrorMessage } from '../services/aiErrorMessages';
import { cachedRussianNote } from '../services/agent-note-language';
import type { AgentWorkEntry } from '../types/agent-work';
import {
  observeAiSubmission,
  type AiSubmissionResult
} from '../services/aiSubmission';
import { prepareDesktopAgentAttachments } from '../services/desktop-agent-attachments';
import {
  readAgentOutput,
  uploadAgentPhoto
} from '../services/desktop-agent-output';
import { getChatHistorySnapshot, saveMessages } from '../services/useChatDb';
import {
  isAIMessage,
  type AIMessage,
  type AIMessageReference
} from '../types/messages';
import { generateUUID } from '../utils/generateUUID';

export interface AgentChoice {
  name: string;
  value: string;
}

export interface DesktopAgentModel extends AgentChoice {
  efforts: AgentChoice[];
  defaultEffort: string;
}

export async function fetchDesktopAgentModels(): Promise<DesktopAgentModel[]> {
  const result = await invoke<{ models: DesktopAgentModel[] }>(
    'desktop_agent_models'
  );
  if (!result?.models?.length) throw new Error('Нет доступных моделей ИИ.');

  return result.models;
}

export interface AgentOption {
  id: string;
  category?: string;
  currentValue: string;
  options: Array<AgentChoice | { options: AgentChoice[] }>;
}

export interface AgentProject {
  directory: string;
  sessionId?: string;
  replayContext?: boolean;
}

interface Connection extends AgentProject {
  configOptions: AgentOption[];
}

type Permission = {
  type: 'permission';
  requestId: string;
  toolCall: {
    title?: string;
    locations?: { path: string }[];
    content?: { type: string; path?: string; newText?: string }[];
  };
};

type AgentEvent =
  | { type: 'closed' }
  | { type: 'directory_selected'; directory: string }
  | Permission
  | {
      type: 'update';
      update:
        | {
            sessionUpdate: 'config_option_update';
            configOptions: AgentOption[];
          }
        | {
            sessionUpdate: 'agent_message_chunk';
            content: { type: string; text?: string };
          }
        | {
            sessionUpdate: 'tool_call' | 'tool_call_update';
            title?: string;
            receivedChars?: number;
            commentary?: string;
            workEntry?: AgentWorkEntry;
            reasoningSummary?: { id: string; text: string };
          };
    };

export interface DesktopAgentChat {
  id: string;
  storageKey: string;
  project: AgentProject | null;
  pendingDirectory: string;
  connected: boolean;
  configOptions: AgentOption[];
  messages: AIMessage[];
  busy: 'directory' | 'config' | 'attachments' | null;
  running: boolean;
  startedAt: number | null;
  loadingHistory: boolean;
  error: string | null;
  toolTitle: string;
  workLog: Map<string, AgentWorkEntry>;
  lastProgressAt: number | null;
  receivedChars: number;
  permissions: Permission[];
}

const chats = shallowReactive(new Map<string, DesktopAgentChat>());
const channels = new Map<string, Channel<AgentEvent>>();
const historyLoads = new Map<string, Promise<void>>();

export function getDesktopAgentChat(
  id?: string | null
): DesktopAgentChat | undefined {
  return id ? chats.get(id) : undefined;
}

export async function loadDesktopAgentChat(
  id: string,
  ownerId: string,
  project: AgentProject | null
): Promise<DesktopAgentChat> {
  let chat = chats.get(id);
  const storageKey = `desktop-agent:${ownerId}:${id}`;
  if (chat && chat.storageKey !== storageKey) {
    throw new Error('Локальный чат доступен только владельцу.');
  }
  if (!chat) {
    chat = reactive<DesktopAgentChat>({
      id,
      storageKey,
      project,
      pendingDirectory: '',
      connected: false,
      configOptions: [],
      messages: [],
      busy: null,
      running: false,
      startedAt: null,
      loadingHistory: true,
      error: null,
      toolTitle: '',
      workLog: new Map<string, AgentWorkEntry>(),
      lastProgressAt: null,
      receivedChars: 0,
      permissions: []
    });
    chats.set(id, chat);
    const current = chat;
    const load = getChatHistorySnapshot(current.storageKey)
      .then(({ messages }): void => {
        current.messages = messages.filter(isAIMessage).map(message => ({
          ...message,
          loading: false
        }));
      })
      .catch((error: unknown): never => {
        chats.delete(id);
        throw error;
      })
      .finally((): void => {
        current.loadingHistory = false;
        historyLoads.delete(id);
      });
    historyLoads.set(id, load);
  }

  await historyLoads.get(id);
  return chat;
}

export function agentChoices(option?: AgentOption): AgentChoice[] {
  return (
    option?.options.flatMap(choice =>
      'options' in choice ? choice.options : [choice]
    ) ?? []
  );
}

function receive(
  chat: DesktopAgentChat,
  channel: Channel<AgentEvent>,
  event: AgentEvent,
  autoApprove: () => boolean
): void {
  if (chats.get(chat.id) !== chat) return;
  if (event.type === 'directory_selected') {
    chat.pendingDirectory = event.directory;
    return;
  }
  if (channels.get(chat.id) !== channel) return;

  if (event.type === 'closed') {
    chat.connected = false;
    chat.configOptions = [];
    chat.permissions = [];
    chat.error =
      'Связь с агентом прервалась. Попробуйте отправить запрос ещё раз.';
    return;
  }

  if (event.type === 'permission') {
    if (chat.running && autoApprove()) {
      void answerDesktopAgentPermission(chat, event.requestId, true);
    } else {
      chat.permissions.push(event);
    }
    return;
  }

  const { update } = event;
  if (update.sessionUpdate === 'config_option_update') {
    chat.configOptions = update.configOptions;
  } else if (chat.running && update.sessionUpdate === 'agent_message_chunk') {
    if (update.content.type === 'text' && update.content.text) {
      const answer = chat.messages.at(-1);
      if (answer?.loading) answer.content += update.content.text;
    }
  } else if (chat.running && 'workEntry' in update && update.workEntry) {
    const entry = update.workEntry;
    chat.workLog.set(entry.id, entry);
    chat.lastProgressAt = Date.now();
  } else if (
    chat.running &&
    'commentary' in update &&
    typeof update.commentary === 'string'
  ) {
    if (update.commentary) {
      const id = 'note:' + chat.workLog.size;
      chat.workLog.set(id, { id, kind: 'commentary', text: update.commentary });
    }
    chat.lastProgressAt = Date.now();
  } else if (
    chat.running &&
    'reasoningSummary' in update &&
    update.reasoningSummary
  ) {
    const { id, text } = update.reasoningSummary;
    if (typeof id !== 'string' || typeof text !== 'string') return;

    const key = 'summary:' + id;
    chat.workLog.set(key, { id: key, kind: 'summary', text });
    chat.lastProgressAt = Date.now();
  } else if (chat.running && 'title' in update && update.title) {
    chat.toolTitle = update.title;
    chat.lastProgressAt = Date.now();
    chat.receivedChars = update.receivedChars ?? 0;
  }
}

export async function connectDesktopAgentChat(
  chat: DesktopAgentChat,
  preferredModel: string,
  autoApprove: () => boolean,
  directorySelection:
    | { previousDirectory?: string }
    | { savedProject: AgentProject }
): Promise<AgentProject | null> {
  if (chat.busy || chat.running) return null;

  chat.busy = 'directory';
  chat.error = null;
  try {
    const events = new Channel<AgentEvent>();
    events.onmessage = (event): void =>
      receive(chat, events, event, autoApprove);
    const args = { threadId: chat.id, events, preferredModel };
    let connection: Connection | null;

    if ('savedProject' in directorySelection) {
      const { directory, sessionId } = directorySelection.savedProject;
      if (!sessionId)
        throw new Error('Выберите папку проекта ещё раз кнопкой в чате.');

      connection = await invoke<Connection>('desktop_agent_resume_directory', {
        ...args,
        directory,
        previousSession: sessionId,
        resetContext: Boolean(directorySelection.savedProject.replayContext)
      });
    } else {
      connection = await invoke<Connection | null>(
        'desktop_agent_pick_directory',
        {
          ...args,
          previousSession: chat.project?.replayContext
            ? undefined
            : chat.project?.sessionId,
          previousDirectory: directorySelection.previousDirectory
        }
      );
    }

    if (!connection) return null;

    if (chats.get(chat.id) !== chat) {
      await invoke('desktop_agent_disconnect', { threadId: chat.id });
      return null;
    }

    channels.set(chat.id, events);
    chat.project = {
      directory: connection.directory,
      sessionId: connection.sessionId,
      replayContext:
        connection.replayContext ||
        (chat.project?.directory === connection.directory
          ? chat.project.replayContext
          : undefined)
    };
    chat.configOptions = connection.configOptions;
    chat.error = null;
    chat.connected = true;
    return chat.project;
  } finally {
    chat.pendingDirectory = '';
    chat.busy = null;
  }
}

export async function setDesktopAgentOption(
  chat: DesktopAgentChat,
  category: 'model' | 'thought_level',
  value: string
): Promise<void> {
  const option = chat.configOptions.find(item => item.category === category);
  if (!option || option.currentValue === value || chat.busy || chat.running)
    return;
  if (!agentChoices(option).some(choice => choice.value === value)) return;

  chat.busy = 'config';
  try {
    chat.configOptions = await invoke<AgentOption[]>(
      'desktop_agent_configure',
      {
        threadId: chat.id,
        configId: option.id,
        value
      }
    );
  } finally {
    chat.busy = null;
  }
}

export async function answerDesktopAgentPermission(
  chat: DesktopAgentChat,
  requestId: string,
  allow: boolean
): Promise<void> {
  const previousError = chat.error;

  try {
    await invoke('desktop_agent_answer_permission', {
      threadId: chat.id,
      requestId,
      allow
    });
    chat.permissions = chat.permissions.filter(
      item => item.requestId !== requestId
    );
    if (chat.running && chat.error === previousError) chat.error = null;
  } catch (error) {
    chat.error = getAiErrorMessage(error);
  }
}

export function persistDesktopAgentMessages(
  chat: DesktopAgentChat
): Promise<void> {
  return saveMessages(
    chat.storageKey,
    chat.messages.map(message => ({
      ...message,
      ...(message.reasoningSummaries
        ? { reasoningSummaries: [...message.reasoningSummaries] }
        : {}),
      ...(message.replyTo ? { replyTo: { ...message.replyTo } } : {})
    }))
  );
}

export async function resetDesktopAgentContext(
  chat: DesktopAgentChat
): Promise<void> {
  if (!chat.project) return;
  if (chat.busy || chat.running)
    throw new Error('Дождитесь завершения операции.');

  if (!chat.connected) {
    chat.project = { ...chat.project, replayContext: true };
    return;
  }

  chat.busy = 'config';
  try {
    const { directory, sessionId, configOptions } = await invoke<Connection>(
      'desktop_agent_reset',
      { threadId: chat.id }
    );
    chat.project = { directory, sessionId, replayContext: true };
    chat.configOptions = configOptions;
  } finally {
    chat.busy = null;
  }
}

function buildHistoryContext(messages: AIMessage[]): string | undefined {
  if (!messages.length) return undefined;
  const context = messages.slice(-30).map(message => ({
    role: message.role,
    text: message.content.slice(0, 1200)
  }));
  return `Предыдущие реплики этого чата для контекста: ${JSON.stringify(context)}`;
}

export async function sendDesktopAgentPrompt(
  chat: DesktopAgentChat,
  text: string,
  files: File[],
  replyTo: AIMessageReference | undefined,
  onAccepted?: () => void,
  previousMessages?: AIMessage[]
): Promise<AiSubmissionResult & { cancelled: boolean }> {
  let cancelled = false;
  const result = await observeAiSubmission(
    async ({ accept, respond }): Promise<void> => {
      if (chat.busy || chat.running || !chat.connected) return;
      chat.error = null;
      chat.busy = 'attachments';
      let answer: AIMessage | undefined;
      let unsavedInputId: string | undefined;
      let requestError: string | null = null;
      const originalHistory = chat.messages.slice();

      try {
        const attachments = await prepareDesktopAgentAttachments(files);
        if (chats.get(chat.id) !== chat || !chat.connected) return;
        const content = text.trim() || 'Посмотри прикреплённые файлы.';
        const label = attachments.map(file => `«${file.name}»`).join(', ');
        const input: AIMessage = {
          id: generateUUID(),
          role: 'user',
          timestamp: Date.now(),
          replyTo,
          ...(files.length
            ? { localFiles: files.map(file => ({ file })) }
            : {}),
          content: label ? `${content}\n\nПрикреплено: ${label}` : content
        };
        const historyContext = chat.project?.replayContext
          ? buildHistoryContext(previousMessages ?? originalHistory)
          : undefined;
        unsavedInputId = input.id;
        if (previousMessages) chat.messages = previousMessages.slice();
        chat.messages.push(input);
        await persistDesktopAgentMessages(chat);
        unsavedInputId = undefined;
        accept();
        chat.startedAt = Date.now();
        chat.lastProgressAt = chat.startedAt;
        chat.messages.push({
          id: generateUUID(),
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          loading: true
        });
        answer = chat.messages.at(-1);
        chat.running = true;
        chat.busy = null;

        const reply = await invoke<{
          stopReason: 'end_turn' | 'cancelled';
          responseText?: string;
          reasoningSummaries?: string[];
          workLog?: AgentWorkEntry[];
          outputFiles?: AIMessage['projectFiles'];
        }>('desktop_agent_prompt', {
          threadId: chat.id,
          text: replyTo
            ? `В ответ на: ${replyTo.content}\n\n${content}`
            : content,
          historyContext,
          attachments
        });
        cancelled = reply.stopReason === 'cancelled';
        if (reply.workLog) {
          chat.workLog = new Map(reply.workLog.map(entry => [entry.id, entry]));
        } else if (reply.reasoningSummaries?.length) {
          const received = new Set(
            [...chat.workLog.values()]
              .filter(entry => entry.kind === 'summary')
              .map(entry => entry.text)
          );
          for (const text of reply.reasoningSummaries) {
            if (received.has(text)) continue;
            const id = 'legacy:' + chat.workLog.size;
            chat.workLog.set(id, { id, kind: 'summary', text });
          }
        }
        if (answer && reply.responseText !== undefined) {
          answer.content = reply.responseText;
        }
        if (!cancelled && answer && reply.outputFiles?.length) {
          answer.projectFiles = reply.outputFiles;
          await persistDesktopAgentMessages(chat);
          for (const file of answer.projectFiles) {
            if (file.linkOnly) continue;
            chat.toolTitle = 'Сохраняю вложение в чат';
            chat.lastProgressAt = Date.now();
            chat.receivedChars = 0;
            const archive = (answer.localFiles ??= []);
            const previousLength = archive.length;
            try {
              const original = await readAgentOutput(chat.id, file);
              const copy: NonNullable<AIMessage['localFiles']>[number] = {
                file: original,
                projectPath: file.path
              };
              archive.push(copy);
              if (original.type.startsWith('image/')) {
                const photo = await uploadAgentPhoto(original);
                (answer.outputAttachments ??= []).push(photo);
                copy.previewId = photo.id;
              }
            } catch (error) {
              file.imageError =
                typeof error === 'string'
                  ? error
                  : 'Не удалось подготовить вложение. Оригинал доступен по пути в проекте.';
            }
            try {
              await persistDesktopAgentMessages(chat);
            } catch (error) {
              if (archive.length === previousLength) throw error;
              archive.splice(previousLength);
              file.imageError =
                'Не удалось сохранить локальную копию. Оригинал доступен по пути в проекте.';
              await persistDesktopAgentMessages(chat);
            }
          }
        }

        if (
          !cancelled &&
          !answer?.content.trim() &&
          !answer?.projectFiles?.length
        ) {
          throw new Error(
            'ИИ не вернул результат. Попробуйте повторить запрос.'
          );
        }

        if (chat.project?.replayContext) {
          chat.project = { ...chat.project, replayContext: false };
        }
        respond(answer?.content ?? null);
      } catch (error) {
        if (unsavedInputId) {
          chat.messages = originalHistory;
        }
        const message = getAiErrorMessage(error);
        requestError = message;

        if (answer && !answer.content.trim()) {
          answer.content = message;
        } else if (answer && answer.content !== message) {
          chat.messages.push({
            id: generateUUID(),
            role: 'assistant',
            content: message,
            timestamp: Date.now()
          });
        }
      } finally {
        if (answer) {
          answer.loading = false;
          if (chat.workLog.size) {
            answer.workLog = [...chat.workLog.values()].map(entry => {
              if (entry.kind !== 'action')
                return {
                  ...entry,
                  text: cachedRussianNote(chat.id, entry.text) ?? entry.text
                };
              return entry.state === 'running'
                ? {
                    ...entry,
                    state: 'interrupted',
                    text: entry.text + ' (завершение не подтверждено)'
                  }
                : { ...entry };
            });
            if (cancelled && !answer.content.trim())
              answer.content = 'Работа остановлена.';
          }
          if (chat.startedAt !== null) {
            answer.durationMs = Math.max(0, Date.now() - chat.startedAt);
          }

          if (!answer.content.trim() && !answer.projectFiles?.length)
            chat.messages.pop();
        }
        chat.permissions = [];
        chat.toolTitle = '';
        chat.workLog.clear();
        chat.lastProgressAt = null;
        chat.receivedChars = 0;
        if (answer && chats.get(chat.id) === chat) {
          try {
            await persistDesktopAgentMessages(chat);
          } catch (error) {
            requestError = getAiErrorMessage(error);
          }
        }
        if (requestError) chat.error = requestError;
        chat.startedAt = null;
        chat.running = false;
        chat.busy = null;
      }
    },
    onAccepted
  );

  return { ...result, cancelled };
}

export async function disconnectDesktopAgentChat(
  chat: DesktopAgentChat
): Promise<void> {
  if (channels.has(chat.id)) {
    await invoke('desktop_agent_disconnect', { threadId: chat.id });
  }
  channels.delete(chat.id);
  chat.connected = false;
  chat.configOptions = [];
  chat.permissions = [];
}

export async function discardDesktopAgentChat(
  chat: DesktopAgentChat
): Promise<void> {
  await disconnectDesktopAgentChat(chat);
  chats.delete(chat.id);
}

export async function cancelDesktopAgentPrompt(
  chat: DesktopAgentChat
): Promise<void> {
  if (chat.running) await invoke('desktop_agent_cancel', { threadId: chat.id });
}
