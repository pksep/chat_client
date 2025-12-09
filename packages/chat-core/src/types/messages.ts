import { MessageItem } from '@openim/wasm-client-sdk';

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
  timestamp?: number;
}

interface ExtendedOpenIMMessage {
  isSystemMessage?: boolean;
  systemMessageType?: string;
  systemMessageContent?: string;
  senderFaceUrl?: string; // This is used in MessageList component
  faceURL?: string;
  isReadByPeer?: boolean;
}

// Union the OpenIM MessageItem with our extensions
export type OpenIMMessage = Partial<MessageItem> & ExtendedOpenIMMessage;

// Union type for both message types
export type Message = AIMessage | OpenIMMessage;

// Type guards to differentiate between message types
export function isAIMessage(message: Message): message is AIMessage {
  return 'role' in message && 'content' in message;
}

export function isOpenIMMessage(message: Message): message is OpenIMMessage {
  return 'sendID' in message && 'sendTime' in message;
}
