import type { Message as ChatSDKMessage } from '@pksep/zod-shared-chat';

export interface AIMessageReference {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
  timestamp?: number;
  pinned?: boolean;
  replyTo?: AIMessageReference;
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
