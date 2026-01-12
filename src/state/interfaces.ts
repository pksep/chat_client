// Define the interfaces that were missing from the state module

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
  contact?: any; // Should be replaced with proper IUserProps if available
  members?: any[]; // Should be replaced with proper IUserProps[] if available
  contacts?: any[]; // Should be replaced with proper IUserProps[] if available
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
  selectedContacts?: any[]; // Should be replaced with proper contact type if available
  q?: string;
  selectedIds?: string[];
}

export interface NewGroupState {
  groupName?: string;
  groupAvatar?: string;
  selectedMembers?: any[]; // Should be replaced with proper member type if available
  checkUsers?: any[];
  file?: File;
  isEditAvatar?: boolean;
  avatarPreview?: string;
  isSelectedMembers?: boolean;
  isCreating?: boolean;
}