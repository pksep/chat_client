import { computed, reactive, ref, watch, toRefs } from 'vue';
import type { INewContactProps } from '../interfaces/new-contact';
import { createGroup } from '../../../services/useGroup';
import { uploadFile } from '../../../services/useChat';
import { IUser } from '../../interfaces/interfaces';

interface NewGroupState {
  checkUsers: string[];
  groupName: string;
  isEditAvatar: boolean;
  file: File | null;
  isSelectedMembers: boolean;
  avatarPreview: string;
  isCreating: boolean;
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
    avatarPreview: '',
    isCreating: false
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
    console.log('onAvatarSelected');
  };

  const onSaveAvatar = async (): Promise<void> => {
    console.log('onSaveAvatar', state.file);

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
      if (state.groupName.length > 140) {
        return state.groupName.substring(0, 140);
      }
      if (group && (group.topicId || group.topicId)) {
        emit('unmount-new-group', group);

        closeModal();
        return group;
      } else {
        console.error('[NewGroupModal] Invalid group returned, not emitting');
        return undefined;
      }
    } catch (error) {
      console.error('Failed to create group:', error);
      throw error;
    } finally {
      state.isCreating = false;
    }
  };

  const createNiceName = (arr: IUser[]) => {
    const names = arr
      .map(user => user.initial || user.initials || '')
      .join(', ');
    return names;
  };

  const handleOpenGroupInfo = async (contacts: IUser[]): Promise<void> => {
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
