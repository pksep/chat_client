import { computed, reactive, ref, watch, toRefs } from 'vue';
import type { INewContactProps } from '../interfaces/new-contact';
import { createGroup } from '../../../services/useGroup';
import { uploadFile } from '../../../services/useOpenIM';
import { IUserProps } from '../../interfaces/interfaces';

interface NewGroupState {
  checkUsers: string[];
  groupName: string;
  isEditAvatar: boolean;
  file: File | null;
  isSelectedMembers: boolean;
  avatarPreview: string;
}

interface ExtendedProps extends INewContactProps {}

type NewGroupModalEmits = {
  (e: 'unmount-close'): void;
  (e: 'unmount-new-group', group: any): void;
};

export function useNewGroupModal<Emits extends NewGroupModalEmits>(
  props: ExtendedProps,
  emit: Emits
) {
  const avatarInputRef = ref<HTMLInputElement | null>(null);

  const state = reactive<NewGroupState>({
    checkUsers: [],
    groupName: '',
    isEditAvatar: false,
    file: null,
    isSelectedMembers: false,
    avatarPreview: ''
  });

  const selectedContacts = computed(() => [
    props.user,
    ...props.contacts.filter(c => new Set(state.checkUsers).has(c.id))
  ]);

  watch(
    () => props.open,
    newOpen => {
      if (!newOpen) {
        clearState();
      }
    }
  );

  const onAvatarSelected = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    state.file = file;
    state.isEditAvatar = true;
  };

  const onSaveAvatar = async (): Promise<void> => {
    const url = await uploadFile(state.file!);
    state.avatarPreview = url;
    state.isEditAvatar = false;
  };

  const closeEditAvatar = (): void => {
    state.isEditAvatar = false;
  };

  const clearState = () => {
    state.checkUsers = [];
    state.groupName = '';
    state.file = null;
    state.isSelectedMembers = false;
    state.avatarPreview = '';
  };

  const closeModal = (): void => {
    clearState();
    emit('unmount-close');
  };

  const handleCreateGroup = async (): Promise<any> => {
    state.isCreating = true;
    try {
      const group = await createGroup(
        state.checkUsers,
        state.groupName,
        state.avatarPreview
      );
      if (group && group.conversationID) {
        emit('unmount-new-group', group);
        closeModal();
        return group;
      } else {
        console.error('[NewGroupModal] Invalid group returned, not emitting');
        // Optionally: Show error toast or keep modal open
        return undefined;
      }
    } catch (error) {
      console.error('Failed to create group:', error);
      // Don't close modal on error; let user retry
      throw error; // Let parent handle UI (e.g., toast)
    } finally {
      state.isCreating = false;
    }
  };

  const createNiceName = (arr: IUserProps[]) => {
    const names = arr.map(user => user.nickname).join(', ');
    return names;
  };

  const handleOpenGroupInfo = async (contacts: IUserProps[]): Promise<void> => {
    state.isSelectedMembers = true;
    state.checkUsers = contacts.map(contact => contact.id);
    if (!state.groupName) {
      state.groupName = createNiceName(contacts);
    }
  };

  const handleCloseGroupInfo = async (): Promise<void> => {
    state.isSelectedMembers = false;
  };

  return {
    avatarInputRef,
    selectedContacts,
    ...toRefs(state),
    onAvatarSelected,
    onSaveAvatar,
    createNiceName,
    closeEditAvatar,
    clearState,
    closeModal,
    handleCreateGroup,
    handleOpenGroupInfo,
    handleCloseGroupInfo
  };
}
