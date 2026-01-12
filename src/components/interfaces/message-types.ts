import { MessageItem } from '@openim/wasm-client-sdk';

// Interface for AI messages
export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
  timestamp?: number;
}

// Extended OpenIM message interface
interface ExtendedOpenIMMessage {
  isSystemMessage?: boolean;
  systemMessageType?: string;
  systemMessageContent?: string;
  senderFaceUrl?: string;
  faceURL?: string;
  isReadByPeer?: boolean;
  loading?: boolean;
}

// OpenIM message type
export type OpenIMMessage = Partial<MessageItem> & ExtendedOpenIMMessage;

// Combined message type
export type Message = AIMessage | OpenIMMessage;

// OpenIM message with loading status
export interface OpenIMMessageWithLoading extends OpenIMMessage {
  loading?: boolean;
}

// Type guard for AI messages
export function isAIMessage(message: Message): message is AIMessage {
  return 'role' in message && 'content' in message;
}

// Type guard for OpenIM messages
export function isOpenIMMessage(message: Message): message is OpenIMMessage {
  return 'sendID' in message && 'sendTime' in message;
}
