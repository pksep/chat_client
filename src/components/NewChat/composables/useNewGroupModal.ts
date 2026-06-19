import { computed, reactive, ref, watch, toRefs } from 'vue';
import type { INewContactProps } from '../interfaces/new-contact';
import { useGroup } from '../../../composables/useGroup';
import { uploadFile } from '../../../services/useChat';
import { IUser } from '../../interfaces/interfaces';
import { navigateToGroup } from '../../../composables/navigation';
import { getAuthUser } from '../../../composables/useAuth';
import { getUsersList } from '../../../composables/useUsers';

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
};

export function useNewGroupModal<Emits extends NewGroupModalEmits>(
  props: ExtendedProps,
  emit: Emits
) {
  const avatarInputRef = ref<HTMLInputElement | null>(null);
  const { createGroup } = useGroup();

  const authUser = computed(() => getAuthUser());
  const users = computed(() => getUsersList());

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
    authUser.value,
    ...users.value.filter(c => new Set(state.checkUsers).has(c.id))
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

  const onSaveAvatar = async (croppedFile?: File): Promise<void> => {
    const avatarFile = croppedFile || state.file;

    if (!avatarFile) {
      return;
    }

    const file = await uploadFile(avatarFile);

    state.avatarPreview = file.path;
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
        navigateToGroup(group.topicId);

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

  const createNiceName = <T extends { initials: string }>(arr: T[]) => {
    const names = arr.map(user => user.initials || '').join(', ');
    return names;
  };

  const handleOpenGroupInfo = async (users: IUser[]): Promise<void> => {
    state.isSelectedMembers = true;
    state.checkUsers = users.map(user => user.id);
    if (!state.groupName) {
      state.groupName = createNiceName(users);
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
