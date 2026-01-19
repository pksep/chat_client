export interface MenuState {
  open?: boolean;
  chapter?: string;
  selectedContactId?: string | null;
  isLoading?: boolean;
}

export interface IMenuInfoInformation {
  id?: string;
  title?: string;
  description?: string;
  avatarUrl?: string;
  name?: string;
  date?: string;
  groupId?: string;
  userId?: string;
}

export interface UseResizeStateOptions {
  initialWidth?: number;
  initialHeight?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  breakpoint?: string | number;
  storageKey?: string;
  initialState?: any;
  onStateChange?: (state: any) => void;
}

export interface IMenuInfoState {
  open?: boolean;
  contact?: any;
  members?: any[];
  contacts?: any[];
  information?: IMenuInfoInformation;
  openAddUser?: boolean;
  filteredMembers?: any[];
}

export interface NewChatMobileModalState {
  open?: boolean;
  step?: number;
  checkMembers?: any[];
  information?: IMenuInfoInformation;
  isSelectedMembers?: boolean;
  avatarPreview?: string;
  isEditAvatar?: boolean;
  file?: File;
  isCreating?: boolean;
}

export interface IContactSelectorState {
  selectedContacts?: any[];
  q?: string;
  selectedIds?: string[];
}

export interface NewGroupState {
  groupName?: string;
  groupAvatar?: string;
  selectedMembers?: any[];
  checkUsers?: any[];
  file?: File;
  isEditAvatar?: boolean;
  avatarPreview?: string;
  isSelectedMembers?: boolean;
  isCreating?: boolean;
}
