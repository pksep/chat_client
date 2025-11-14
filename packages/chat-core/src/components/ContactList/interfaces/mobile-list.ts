import type { IContactProps } from '../../interfaces/interfaces';

export interface IMobileListProps {
  chapter?: string | null;
  dataTestid?: string;
  contacts: IContactProps[];
}

export interface IMobileListEmits {
  (e: 'unmount-contact', contact: IContactProps): void;
  (e: 'unmount-chapter', chapter: string): void;
}
