import type { IContactProps } from '../../interfaces/interfaces';

export interface IContactListProps {
  class?: string;
  addButtonClass?: string;
  listClass?: string;
  userClass?: string;
  contacts: IContactProps[];
  dataTestid?: string;
}
