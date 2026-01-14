import { IMenuInfoEmits } from '@/composables/useMenuInfo';
import { User, TopicSetting } from '@pksep/zod-shared-chat';

interface TopicSettingWithUser extends TopicSetting {
  user?: User;
}

export interface IHeaderProps {
  class?: string;
  chapter?: string | null;
  contact?: IUserProps;
  members?: IUserProps[];
  dataTestid?: string;
  [key: string]: any; // need delete
}

export interface IMenuEmits {
  (e: 'unmount-contact', contact: IUserProps): void;
  (e: 'unmount-collapse', isCollapse: boolean): void;
  (e: 'unmount-new-contact', config: { isChapterOpen?: boolean }): void;
  (e: 'unmount-new-group', config: { isChapterOpen?: boolean }): void;
  (
    e: 'unmount-chapter',
    config: { nickname: string; contact: IUserProps } | string | null
  ): void;
  (e: 'unmount-user-add'): void;
  (e: 'unmount-contacts-update', contacts: IUserProps[]): void;
}

export interface IHeaderEmits extends IMenuInfoEmits {
  (e: 'unmount-click', isCollapse?: boolean): void;
  (e: 'unmount-contact', contact: IUserProps): void;
  (e: 'unmount-notification', statusNotification?: string): void;
  (e: 'unmount-information', info?: boolean): void;
  (e: 'unmount-clear'): void;
  (e: 'unmount-exit'): void;
}

export type IUserProps = {
  avatarAlt?: string;
  avatarUrl?: string;
  id?: string;
  ex?: string | Record<string, any>;
  initial?: string;
  initials?: string;
  nickname?: string;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
  conversationId?: string;
  groupId?: string;
  membersLength?: number;
  dataTestid?: string;
};

export interface IContactUser {
  id: string;
  initials: string;
  nickname: string;
  avatarUrl: string | null;
}

export interface IContactProps extends IUserProps {
  title?: string;
  latestMessage?: string;
  isRead?: boolean;
  latestMessageTime?: number;
  notificationCount?: number;
  isPin?: boolean;
  groupId?: string;
  userId?: string;
  latestMessageStatus?: string;
  isLatestMessageFromMe?: boolean;
  user?: IContactUser | User;
  info?: TopicSettingWithUser;
}

export interface IMenuProps {
  open?: boolean;
  chapter?: string;
  user?: IUserProps | null;
  contact?: IUserProps | null;
  dataTestid?: string;
  class?: string;
}

export interface IMenuRightProps extends IMenuProps {
  members?: IUserProps[];
  activeTabId?: number;
  groupId?: string;
}

export interface IChatContainerConfig {
  CHAT_MASTRA_URL?: string;
  CHAT_AUTH_API?: string;
  CHAT_API_DOMAIN?: string;
  CHAT_WS_DOMAIN?: string;
  CHAT_ERP_URL?: string;
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
