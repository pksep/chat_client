import { IMenuInfoEmits } from '../../composables/useMenuInfo';
import {
  User,
  TopicSetting,
  Topic,
  Message,
  Group,
  Media
} from '@pksep/zod-shared-chat';

export interface IHeaderProps {
  contact?: IUser;
  members?: IUser[];
  dataTestid?: string;
}

export interface IMenuEmits {
  (e: 'unmount-collapse', isCollapse: boolean): void;
  (e: 'unmount-new-contact', config: { isChapterOpen?: boolean }): void;
  (e: 'unmount-new-group', config: { isChapterOpen?: boolean }): void;
  (e: 'unmount-contacts-update', contacts: IUser[]): void;
}

export interface IHeaderEmits extends IMenuInfoEmits {
  (e: 'unmount-click', isCollapse?: boolean): void;
  (e: 'unmount-contact', contact: IUser): void;
  (e: 'unmount-notification', statusNotification?: string): void;
  (e: 'unmount-information', info?: boolean): void;
  (e: 'unmount-clear'): void;
  (e: 'unmount-exit'): void;
}

export interface IUser extends User {}

export interface IGroup extends Group {
  members?: IUser[];
  membersLength?: number;
}

export interface ITopic extends Topic {
  info?: Partial<TopicSetting>;
  isPin?: boolean;
  lastMessage?: IMessage;
  members?: IUser[];
  group?: Group;
  user?: IUser;
  name?: string;
  avatarUrl?: string;
  unreadMessageCount?: number;
  isAdmin?: boolean;
}

export interface IMenuProps {
  open?: boolean;
  dataTestid?: string;
  class?: string;
}

export interface IMenuRightProps extends IMenuProps {
  members?: IUser[];
  activeTabId?: number;
  groupId?: string;
  excludedContactIds?: Set<string | number>;
}

export interface IMedia extends Media {
  size: number;
  originName: string;
  isLoading?: boolean;
  thumbnailPath?: string;
  localPath?: string;
}

export enum MessageStatusEnum {
  READ = 'READ',
  DELIVERED = 'DELIVERED',
  WAIT = 'WAIT',
  NOT_DELIVERED = 'NOT_DELIVERED'
}

export interface IChatContainerConfig {
  CHAT_MASTRA_URL?: string;
  CHAT_AUTH_API?: string;
  CHAT_API_DOMAIN?: string;
  CHAT_WS_DOMAIN?: string;
  CHAT_ERP_URL?: string;
  CHAT_PATH_TO_FILE_CDN?: string;
  CHAT_S3_BUCKET_NAME?: string;
  CHAT_S3_REGION?: string;
  CHAT_S3_ACCESS_KEY_ID?: string;
  CHAT_S3_SECRET_ACCESS_KEY?: string;
  CHAT_S3_ENDPOINT?: string;
}

export interface IChatContainerProps {
  baseUrl?: string;
  dataTestid?: string;
  config: IChatContainerConfig;
}

export interface IChatContainerEmits {
  (e: 'unmount-notification-count', count: number): number;
}

export interface IUserProfileProps {
  user: IUser;
  dataTestid?: string;
}

export interface IGroupProfileProps {
  topic?: ITopic | null;
  dataTestid?: string;
}

export interface IMessage extends Message {
  senderUser?: IUser;
  media?: IMedia[];
  ex?: string; // "{ clientId: string }"
}
