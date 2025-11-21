import type { IContactProps, IUserProps } from '../../interfaces/interfaces';

export interface IMobileListProps {
  chapter?: string | null;
  dataTestid?: string;
  contacts: IContactProps[];
}

export interface IMobileListEmits {
  (
    e: 'unmount-chapter',
    config: { nickname: string; contact: IContactProps } | string | null
  ): void;
  (e: 'unmount-contact', contact: IUserProps | IUserProps[]): void;
}
