import type { MediaType } from '../../../services/useChatSDK/types';

export interface MessageMediaItem {
  type: MediaType;
  path: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
}

export interface IMessageBubbleProps {
  message: string;
  author?: string;
  time: string;
  loader?: boolean;
  isRead?: boolean;
  isMeSender?: boolean;
  sender?: string;
  avatar?: string;
  media?: MessageMediaItem;
  file?: MessageMediaItem;
  dataTestid?: string;
  messageStatus?: string;
}

export interface IMessageStatusIconsProps {
  isRead?: boolean;
  messageStatus?: string;
  isMeSender?: boolean;
  dataTestid?: string;
}
