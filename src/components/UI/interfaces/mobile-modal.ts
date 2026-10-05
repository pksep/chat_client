export type CSSClass =
  | string
  | Record<string, boolean>
  | (string | Record<string, boolean>)[];

export interface IMobileModalProps {
  open: boolean;
  isDisabledStartButton?: boolean;
  showCloseButton?: boolean;
  closeButtonText?: string;
  startButtonText?: string;
  title?: string;
  showDivider?: boolean;
  menuHeading?: boolean;
  class?: CSSClass;
  headerClass?: CSSClass;
  dataTestid?: string;
}

export interface IMobileModalEmits {
  (e: 'unmount-close'): void;
  (e: 'unmount-next'): void;
}
