import { MediaTypeType } from '@pksep/zod-shared-chat';
import { IMedia } from 'src/components/interfaces/interfaces';

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
  isEdit?: boolean;
  isMeSender?: boolean;
  sender?: string;
  avatar?: string;
  media?: IMedia[];
  file?: MessageMediaItem[];
  dataTestid?: string;
  topicId?: string;
  messageId?: string;
  messageStatus?: string;
}

export interface IMessageStatusIconsProps {
  isRead?: boolean;
  messageStatus?: string;
  isMeSender?: boolean;
  dataTestid?: string;
}
