import type { IContactProps } from '../../interfaces/interfaces';

export interface IMobileListProps {
  chapter?: string | null;
  dataTestid?: string;
  contacts: IContactProps[];
}

export interface IMobileListEmits {
  (
    e: 'unmount-chapter',
    config: { name: string; contact: IContactProps } | string | null
  ): void;
  (e: 'unmount-contact', contact: IContactProps): void;
}
