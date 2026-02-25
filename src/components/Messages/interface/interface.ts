import { MediaTypeType, Reaction } from '@pksep/zod-shared-chat';
import { IMedia, IMessage, IUser } from 'src/components/interfaces/interfaces';

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
  time?: string;
  loader?: boolean;
  isRead?: boolean;
  isPin?: boolean;
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
  replyMessage?: IMessage;
  forwardUser?: IUser;
  reactions?: Reaction[];
}

export interface IMessageContextMenu extends IMessageBubbleProps {
  isOpen: any;
  position: any;
}

export interface IMessageStatusIconsProps {
  isRead?: boolean;
  messageStatus?: string;
  isMeSender?: boolean;
  dataTestid?: string;
}

export interface IForwardModalProps {
  open?: boolean;
  dataTestid?: string;
}
