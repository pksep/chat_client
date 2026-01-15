import type { ITopic } from '../../interfaces/interfaces';

export interface IContactListProps {
  class?: string;
  showAddButton?: boolean;
  addButtonClass?: string;
  listClass?: string;
  userClass?: string;
  topics: ITopic[];
  dataTestid?: string;
  selectedTopicId?: string;
  groupId?: string;
}
