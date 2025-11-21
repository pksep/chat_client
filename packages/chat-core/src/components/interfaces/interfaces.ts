export interface IHeaderProps {
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
  (e: 'unmount-notification', statusNotification?: string): void;
  (e: 'unmount-information', info?: boolean): void;
  (e: 'unmount-clear'): void;
  (e: 'unmount-exit'): void;
}

export interface IUserProps {
  id?: string;
  avatarUrl?: string;
  avatarAlt?: string;
  nickname?: string;
  conversionId?: string;
  groupId?: string;
  ex?: string;
  tabel?: string;
  initial?: string;
}

export interface IContactProps extends IUserProps {
  latestMessage?: string;
  isRead?: boolean;
  latestMessageTime?: number;
  notificationCount?: number;
  isPin?: boolean;
  groupId?: string;
  userId?: string;
}

export interface IMenuProps {
  open?: boolean;
  contact?: IUserProps;
  dataTestid?: string;
}

export interface IMenuRightProps extends IMenuProps {
  activeTabId?: number;
  groupId?: string;
}

export interface IChatContainerProps {
  token?: string;
  baseUrl?: string;
  user?: IUserProps;
  dataTestid?: string;
}

export interface IChatContainerEmits {
  (e: 'unmount-notification-count', count: number): number;
}
