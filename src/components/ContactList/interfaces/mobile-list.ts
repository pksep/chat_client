import type { ITopic, IUser } from '../../interfaces/interfaces';

export interface IMobileListProps {
  contact?: IUser;
  chapter?: string | null;
  dataTestid?: string;
  contacts: ITopic[];
}

export interface IMobileListEmits {
  (
    e: 'unmount-chapter',
    config: { nickname: string; contact: ITopic } | string | null
  ): void;
  (e: 'unmount-contact', contact: IUser | IUser[]): void;
}
