import type { IContactProps } from '../../interfaces/interfaces';

export interface IContactListProps {
  contacts: IContactProps[];
  dataTestid?: string;
  selectedContactId?: string;
}
