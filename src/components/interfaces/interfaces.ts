export interface IHeaderProps {
  class?: string;
  chapter?: string | null;
  contact?: IUserProps;
  members?: IUserProps[];
  dataTestid?: string;
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
}

export interface IHeaderEmits {
  (e: 'unmount-click', isCollapse?: boolean): void;
  (e: 'unmount-contact', contact: IUserProps): void;
  (e: 'unmount-notification', statusNotification?: string): void;
  (e: 'unmount-information', info?: boolean): void;
  (e: 'unmount-clear'): void;
  (e: 'unmount-exit'): void;
}

export interface IUserProps {
  id?: string;
  avatarUrl?: string;
  faceURL?: string;
  avatarAlt?: string;
  nickname?: string;
  conversationId?: string;
  groupId?: string;
  ex?: string;
  tabel?: string;
  initial?: string;
  createdAt?: Date;
  membersLength?: number;
  dataTestid?: string;
}

export interface IContactProps extends IUserProps {
  latestMessage?: string;
  isRead?: boolean;
  latestMessageTime?: number;
  notificationCount?: number;
  isPin?: boolean;
  groupId?: string;
  userId?: string;
  latestMessageStatus?: number;  // Status of the latest message (1: sending, 2: delivered, 3: failed)
  isLatestMessageFromMe?: boolean;  // Indicates if the latest message was sent by the current user
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
  CHAT_OPENIM_API_DOMAIN?: string;
  CHAT_OPENIM_WS_DOMAIN?: string;
}

export interface IChatContainerProps {
  token?: string;
  baseUrl?: string;
  dataTestid?: string;
  config: IChatContainerConfig;
}

export interface IChatContainerEmits {
  (e: 'unmount-notification-count', count: number): number;
}
