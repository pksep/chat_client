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
  creationError: string;
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
    isCreating: false,
    creationError: ''
  });

  const selectedContacts = computed(() => {
    const selectedIds = new Set(state.checkUsers);
    return [
      ...(authUser.value ? [authUser.value] : []),
      ...users.value.filter(
        user => selectedIds.has(user.id) && user.id !== authUser.value?.id
      )
    ];
  });

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

    (e.target as HTMLInputElement).value = '';

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
    state.isEditAvatar = false;
    state.creationError = '';
  };

  const closeModal = (): void => {
    clearState();
    emit('unmount-close');
  };

  const handleCreateGroup = async (): Promise<any> => {
    const name = state.groupName.trim().slice(0, 140);
    if (state.isCreating || !name) return;

    state.isCreating = true;
    state.creationError = '';
    try {
      const group = await createGroup(
        state.checkUsers,
        name,
        state.avatarPreview
      );

      if (group?.topicId) {
        navigateToGroup(group.topicId);

        closeModal();
        return group;
      } else {
        console.error('[NewGroupModal] Invalid group returned, not emitting');
        state.creationError = 'Не удалось создать группу. Попробуйте ещё раз.';
        return undefined;
      }
    } catch (error) {
      console.error('Failed to create group:', error);
      state.creationError = 'Не удалось создать группу. Попробуйте ещё раз.';
      return undefined;
    } finally {
      state.isCreating = false;
    }
  };

  const createNiceName = <T extends { initials: string }>(arr: T[]) => {
    const names = arr
      .map(user => user.initials || '')
      .join(', ')
      .slice(0, 140);
    return names;
  };

  const handleOpenGroupInfo = async (users: IUser[]): Promise<void> => {
    state.isSelectedMembers = true;
    state.checkUsers = [...new Set(users.map(user => user.id))].filter(
      id => id !== authUser.value?.id
    );
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
