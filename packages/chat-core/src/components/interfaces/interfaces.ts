export interface IMenuEmits {
  (e: 'unmount-collapse', isCollapse: boolean): void;
  (e: 'unmount-new-contact', isNewContact: boolean): void;
  (e: 'unmount-chapter', config: { name: string } | null): void;
  (e: 'unmount-user-add'): void;
}

export interface IHeaderEmits {
  (e: 'unmount-click', isCollapse?: boolean): void;
}

export interface IMenuProps {
  open?: boolean;
}
