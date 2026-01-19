import { ITopic, IUser } from '../../interfaces/interfaces';

export interface IContactSelectorEmits {
  (e: 'unmount-contact', topic: ITopic | ITopic[] | IUser | IUser[]): void;
}

export interface IContactSelectorState {
  selectedIds: Set<string | number>;
  q: string;
}

export interface IContactSelectorProps {
  contacts: IUser[];
  isButtonDisabled?: boolean;
  selectedContactIds?: Set<string | number>;
  isAddOne?: boolean;
  dataTestid?: string;
}

export interface INewChatMobileProps extends IContactSelectorProps {
  open: boolean;
  user?: IUser;
}

export interface INewChatMobileEmits extends IContactSelectorEmits {
  (e: 'unmount-close');
  (e: 'unmount-new-group');
  (e: 'unmount-chapter');
}
