import type { IUserProps } from '../../interfaces/interfaces';

export interface IMobileListProps {
  chapter?: string | null;
  dataTestid?: string;
  contacts: IUserProps[];
}

export interface IMobileListEmits {
  (e: 'unmount-contact', contact: IUserProps): void;
  (e: 'unmount-chapter', chapter: string): void;
}
