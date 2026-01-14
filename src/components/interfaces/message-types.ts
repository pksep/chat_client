import type { Message as ChatSDKMessage } from '@pksep/zod-shared-chat';

// Interface for AI messages
export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
  timestamp?: number;
}

// Extended chat message interface
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

// Chat message type
export type ChatMessage = ChatSDKMessage & ExtendedChatMessage;

// Combined message type
export type Message = AIMessage | ChatMessage;

// Chat message with loading status
export interface ChatMessageWithLoading extends ChatMessage {
  loading?: boolean;
}

// Type guard for AI messages
export function isAIMessage(message: Message): message is AIMessage {
  return 'role' in message && 'content' in message;
}

// Type guard for chat messages
export function isChatMessage(message: Message): message is ChatMessage {
  return 'topicId' in message && 'senderUserId' in message;
}
