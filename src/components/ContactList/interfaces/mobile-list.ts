import type { ITopic, IUser } from '../../interfaces/interfaces';

export interface IMobileListProps {
  dataTestid?: string;
  transitionClass?: string;
}

export interface IMobileListEmits {
  (
    e: 'unmount-chapter',
    config: { nickname: string; contact: ITopic } | string | null
  ): void;
  (e: 'unmount-contact', contact: IUser | IUser[]): void;
}
