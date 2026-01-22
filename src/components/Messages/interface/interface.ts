import { Media, MediaTypeType } from '@pksep/zod-shared-chat';

export interface MessageMediaItem {
  id: string;
  type: MediaTypeType;
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
  media?: Partial<Media & { size: number; originName: string }>[];
  file?: MessageMediaItem[];
  dataTestid?: string;
  messageStatus?: string;
}

export interface IMessageStatusIconsProps {
  isRead?: boolean;
  messageStatus?: string;
  isMeSender?: boolean;
  dataTestid?: string;
}
