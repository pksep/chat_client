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
}

export interface INewChatMobileProps extends IContactSelectorProps {
  open: boolean;
}

export interface INewChatMobileEmits extends IContactSelectorEmits {
  (e: 'unmount-close');
}
