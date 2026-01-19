import type { Message as ChatSDKMessage } from '@pksep/zod-shared-chat';

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
  timestamp?: number;
}

interface ExtendedChatMessage {
  isSystemMessage?: boolean;
  systemMessageType?: string;
  systemMessageContent?: string;
  senderFaceUrl?: string;
  faceURL?: string;
  senderNickname?: string;
  sendTime?: number;
  loading?: boolean;
  media?: any[];
}

export type ChatMessage = ChatSDKMessage & ExtendedChatMessage;

export type Message = AIMessage | ChatMessage;

export interface ChatMessageWithLoading extends ChatMessage {
  loading?: boolean;
}

export function isAIMessage(message: Message): message is AIMessage {
  return 'role' in message && 'content' in message;
}

export function isChatMessage(message: Message): message is ChatMessage {
  return 'topicId' in message && 'senderUserId' in message;
}
