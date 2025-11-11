export interface IHeaderProps {
  chapter?: string | null;
}

export interface IMenuEmits {
  (e: 'unmount-collapse', isCollapse: boolean): void;
  (e: 'unmount-new-contact', isNewContact: boolean): void;
  (e: 'unmount-chapter', config: { name: string } | null): void;
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
  nickname?: string;
}

export interface IMenuProps {
  open?: boolean;
}

export interface IMenuRightProps extends IMenuProps {
  user?: IUserProps;
}

export interface IChatContainerProps {
  token?: string;
  baseUrl?: string;
  user?: IUserProps;
}
