import type { IContactProps } from '../../interfaces/interfaces';

export interface IContactListProps {
  class?: string;
  showAddButton?: boolean;
  addButtonClass?: string;
  listClass?: string;
  userClass?: string;
  contacts: any[];
  dataTestid?: string;
  selectedContactId?: string;
  groupId?: string;
}
