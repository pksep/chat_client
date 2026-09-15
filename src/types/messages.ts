import type { Message as ChatSDKMessage } from '@pksep/zod-shared-chat';
import type { AiMessageAttachment } from '../services/aiAttachmentReferences';
import type { AiOutputAttachment } from '../services/aiOutputAttachments';
import type { PendingToolApproval } from '../services/mastraApproval';
import type { AiActionTask } from '../services/aiActionTasks';

export interface AIMessageReference {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIMessage {
  id?: string;
  requestId?: string;
  actionTask?: AiActionTask;
  role: 'user' | 'assistant';
  content: string;
  modelContent?: string;
  loading?: boolean;
  timestamp?: number;
  pinned?: boolean;
  pinVersion?: number;
  replyTo?: AIMessageReference;
  /** Описания исходников не исчезают вместе с временным доступом; перед отправкой доступ обновляется. */
  attachments?: AiMessageAttachment[];
  /** Постоянные файлы, сформированные сервисами и доставленные AI через обычное медиа-хранилище чата. */
  outputAttachments?: AiOutputAttachment[];
  /** Источник фонового результата для защиты от повторного добавления. */
  sourceId?: string;
  /** Служебная связь с ожидающим подтверждением сохраняется при обновлении страницы. */
  pendingToolApproval?: PendingToolApproval;
}

export interface ChatMessage extends ChatSDKMessage {
  id: string;
  systemMessageType?: string;
  systemMessageContent?: string;
  senderNickname?: string;
  loading?: boolean;
  media?: any[];
  reactions?: any[];
  tempId?: string;
}

export type Message = AIMessage | ChatMessage;

export function isAIMessage(message: Message): message is AIMessage {
  return 'role' in message && 'content' in message;
}

export function isChatMessage(message: Message): message is ChatMessage {
  return 'topicId' in message && 'senderUserId' in message;
}
