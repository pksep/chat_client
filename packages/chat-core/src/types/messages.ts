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
  senderFaceUrl?: string;
  faceURL?: string;
  isReadByPeer?: boolean;
}

export type OpenIMMessage = Partial<MessageItem> & ExtendedOpenIMMessage;

export type Message = AIMessage | OpenIMMessage;

export function isAIMessage(message: Message): message is AIMessage {
  return 'role' in message && 'content' in message;
}

export function isOpenIMMessage(message: Message): message is OpenIMMessage {
  return 'sendID' in message && 'sendTime' in message;
}
