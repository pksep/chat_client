import { IUserProps } from '../../interfaces/interfaces';

export interface IContactSelectorEmits {
  (e: 'unmount-contact', contact: IUserProps[] | IUserProps): void;
}

export interface IContactSelectorState {
  selectedIds: Set<string | number>;
  q: string;
}

export interface IContactSelectorProps {
  contacts: IUserProps[];
  isButtonDisabled?: boolean;
  selectedContactIds?: Set<string | number>;
  isAddOne?: boolean;
  dataTestid?: string;
}

export interface INewChatMobileProps extends IContactSelectorProps {
  open: boolean;
  user?: IUserProps;
}

export interface INewChatMobileEmits extends IContactSelectorEmits {
  (e: 'unmount-close');
  (e: 'unmount-new-group');
  (e: 'unmount-chapter');
}
