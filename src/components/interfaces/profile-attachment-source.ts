import type { IMedia, IMessage } from './interfaces';
import type { TopicAttachmentsPage } from '../../services/useChatSDK/message';

export interface ProfileAttachmentItem {
  key: string;
  media: IMedia;
  message: IMessage;
}

export interface ProfileAttachmentSource {
  key: string;
  showInChat?: (messageId: string) => void;
  projectPath?: (media: IMedia) => string | undefined;
  load: (
    tab: 'media' | 'files',
    cursor: string | null
  ) => Promise<TopicAttachmentsPage>;
}
