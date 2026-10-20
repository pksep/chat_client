import type { AIMessage } from '../types/messages';
import type { AiConversationPage } from './aiConversationTranscript';
import { parseAiMessageAttachments } from './aiAttachmentReferences';
import {
  formatApprovalMessage,
  type PendingToolApproval
} from './mastraApproval';
import { AI_TOOL_RESULT_UNCONFIRMED } from './mastraEventStream';
import type { AiOutputAttachment } from './aiOutputAttachments';
import type { AiActionTask } from './aiActionTaskContract';

/** ID запроса не равен ID сохранённого сообщения: последний назначается сервером. */
export const aiMessageRequestId = (message: AIMessage | undefined) =>
  message?.requestId ?? (message?.role === 'user' ? message.id : undefined);

/** Превращает проверенную переписку в обычные сообщения чата, без запросов доступа к каждому файлу. */
export function createAiConversationView(
  snapshot: Omit<AiConversationPage, 'nextCursor'>,
  local: AIMessage[] = []
): AIMessage[] {
  const result: AIMessage[] = [];
  const requests = new Set(snapshot.messages.map(message => message.requestId));
  snapshot.incompleteMessages.forEach(message =>
    requests.add(message.requestId)
  );
  const answered = new Set(
    snapshot.messages
      .filter(message => message.role === 'assistant')
      .map(message => message.requestId)
  );
  snapshot.incompleteMessages.forEach(message =>
    answered.add(message.requestId)
  );
  snapshot.tasks.forEach(task => answered.add(task.requestId));
  const metadata = (id: string, requestId: string, role: AIMessage['role']) => {
    const exact = local.find(message => message.id === id);
    const candidates = local.filter(
      message =>
        message.role === role && aiMessageRequestId(message) === requestId
    );
    return exact ?? (candidates.length === 1 ? candidates[0] : undefined);
  };
  for (const source of snapshot.messages) {
    const previous = metadata(source.id, source.requestId, source.role);
    const base: AIMessage = {
      id: source.id,
      requestId: source.requestId,
      role: source.role,
      content: source.content,
      timestamp: source.timestamp,
      loading: false,
      ...(source.pinned !== undefined
        ? { pinned: source.pinned, pinVersion: source.pinVersion }
        : previous?.pinned
          ? { pinned: true }
          : {}),
      ...(source.presentationVersion === 1
        ? {
            ...(source.replyTo
              ? {
                  replyTo: {
                    role: source.replyTo.role,
                    content: source.replyTo.content
                  }
                }
              : {}),
            ...(source.modelContent
              ? { modelContent: source.modelContent }
              : {})
          }
        : previous?.replyTo
          ? { replyTo: { ...previous.replyTo } }
          : {}),
      attachments: parseAiMessageAttachments(source.attachments),
      outputAttachments: source.outputAttachments.map(file => ({
        ...file
      })) as AiOutputAttachment[]
    };
    // До переноса представления старого клиента сохраняем подпись только при
    // точном совпадении её модельного текста. Она не заменяет серверный ответ.
    if (
      source.presentationVersion !== 1 &&
      base.role === 'user' &&
      previous?.modelContent === base.content
    ) {
      base.modelContent = previous.modelContent;
      base.content = previous.content;
    }
    let usedNativeId = false;
    if (
      base.role === 'user' ||
      base.content.trim() ||
      base.outputAttachments?.length
    ) {
      result.push(base);
      usedNativeId = true;
    }
    for (const pending of source.pendingToolApprovals) {
      const approval = pending as PendingToolApproval;
      result.push({
        id: usedNativeId
          ? `${source.id}:approval:${approval.toolCallId}`
          : source.id,
        requestId: source.requestId,
        role: 'assistant',
        timestamp: source.timestamp,
        content: formatApprovalMessage(approval),
        pendingToolApproval: structuredClone(approval),
        ...(!usedNativeId
          ? { pinned: base.pinned, pinVersion: base.pinVersion }
          : {})
      });
      usedNativeId = true;
    }
  }
  const insertForRequest = (message: AIMessage) => {
    const last = result.findLastIndex(
      item => aiMessageRequestId(item) === message.requestId
    );
    result.splice(last < 0 ? result.length : last + 1, 0, message);
  };
  for (const missing of snapshot.incompleteMessages) {
    insertForRequest({
      id: missing.id,
      requestId: missing.requestId,
      role: 'assistant',
      content: AI_TOOL_RESULT_UNCONFIRMED,
      loading: false,
      timestamp: result.findLast(
        item => aiMessageRequestId(item) === missing.requestId
      )?.timestamp
    });
  }
  for (const task of snapshot.tasks) {
    const index = result.findLastIndex(
      message =>
        message.role === 'assistant' &&
        message.requestId === task.requestId &&
        !message.pendingToolApproval &&
        !message.actionTask &&
        !message.outputAttachments?.length
    );
    if (index >= 0)
      result[index] = {
        ...result[index],
        actionTask: structuredClone(task) as AiActionTask
      };
    else
      insertForRequest({
        id: `ai-task:${task.id}`,
        requestId: task.requestId,
        role: 'assistant',
        content: '',
        timestamp: task.createdAt,
        actionTask: structuredClone(task) as AiActionTask
      });
  }
  // Неотправленный локальный ввод не исчезает из-за обновления сервера. Его
  // старые карточки не дают прав на действие и не подменяют подтверждения выше.
  for (const message of local) {
    const requestId = aiMessageRequestId(message);
    if (
      requestId &&
      requests.has(requestId) &&
      (message.role === 'user' || answered.has(requestId))
    )
      continue;
    if (message.id && result.some(item => item.id === message.id)) continue;
    if (!message.content.trim() && !message.outputAttachments?.length) continue;
    const display = { ...message, loading: false };
    delete display.pendingToolApproval;
    delete display.actionTask;
    if (requestId && requests.has(requestId)) insertForRequest(display);
    else result.push(display);
  }
  return result;
}
