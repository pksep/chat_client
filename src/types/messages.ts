import type { Message as ChatSDKMessage } from '@pksep/zod-shared-chat';

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
  timestamp?: number;
}

export interface ChatMessage extends ChatSDKMessage {
  isSystemMessage?: boolean;
  systemMessageType?: string;
  systemMessageContent?: string;
  senderFaceUrl?: string;
  faceURL?: string;
  senderNickname?: string;
  sendTime?: number;
  loading?: boolean;
  media?: any[]; // Add media property to ChatMessage type
  reactions?: any[]; // Add reactions property to ChatMessage type
  tempId?: string;
}

export type Message = AIMessage | ChatMessage;

export function isAIMessage(message: Message): message is AIMessage {
  return 'role' in message && 'content' in message;
}

export function isChatMessage(message: Message): message is ChatMessage {
  return 'topicId' in message && 'senderUserId' in message;
}
