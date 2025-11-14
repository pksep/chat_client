export interface IHeaderProps {
  chapter?: string | null;
  contact?: IUserProps;
}

export interface IMenuEmits {
  (e: 'unmount-collapse', isCollapse: boolean): void;
  (e: 'unmount-new-contact', config: { isChapterOpen?: boolean }): void;
  (
    e: 'unmount-chapter',
    config: { name: string; contact: IUserProps } | string | null
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
  name?: string;
  title?: string;
  imageURL?: string;
  nickname?: string;
  conversionId?: string;
}

export interface IContactProps extends IUserProps {
  title?: string;
  imageURL?: string;
  latestMessage?: string;
  isRead?: boolean;
  latestMessageTime?: number;
  notificationCount?: number;
  isPin?: boolean;
}

export interface IMenuProps {
  open?: boolean;
  contact?: IUserProps;
}

export interface IMenuRightProps extends IMenuProps {
  user?: IUserProps;
}

export interface IChatContainerProps {
  token?: string;
  baseUrl?: string;
  user?: IUserProps;
}
