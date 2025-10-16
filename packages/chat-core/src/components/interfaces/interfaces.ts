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
}

export interface IMenuProps {
  open?: boolean;
}
