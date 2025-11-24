export type CSSClass =
  | string
  | Record<string, boolean>
  | (string | Record<string, boolean>)[];

export interface IMobileModalProps {
  open: boolean;
  showCloseButton?: boolean;
  closeButtonText?: string;
  startButtonText?: string;
  title?: string;
  showDivider?: boolean;
  class?: CSSClass;
  headerClass?: CSSClass;
}

export interface IMobileModalEmits {
  (e: 'unmount-close'): void;
  (e: 'unmount-next'): void;
}
