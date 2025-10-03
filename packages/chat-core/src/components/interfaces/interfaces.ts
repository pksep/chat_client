export interface IMenuEmits {
  (e: 'unmount-collapse', isCollapse: boolean): void;
  (e: 'unmount-new-contact', isNewContact: boolean): void;
}
