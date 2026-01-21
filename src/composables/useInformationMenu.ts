import { reactive, Ref } from 'vue';
import { useGroup } from '../composables/useGroup';
import { uploadFile } from '../services/useChat';
import { IMenuInfoInformation } from './useMenuInfo';
import { currentRoute } from './navigation';
import { RouteTypes } from './navigation/useUrlRouting';

export function useInformationMenu(model: Ref<IMenuInfoInformation>) {
  const state = reactive({
    fileImage: null as File | null,
    isEditAvatar: false
  });

  const pathToFile = async (path: string): Promise<File | null> => {
    if (!path) return null;
    const response = await fetch(path);
    if (!response.ok) {
      return null;
    }
    const blob = await response.blob();
    const url = new URL(path);
    const filename = url.pathname.split('/').pop() || 'file';
    return new File([blob], filename, { type: blob.type }) || null;
  };

  const init = async (): Promise<void> => {
    state.fileImage = await pathToFile(model.value?.avatarUrl || '');
  };

  const openEditProfileIcon = (inputRef: HTMLInputElement | null): void => {
    inputRef?.click();
  };

  const onOpenEditAvatar = (e: Event): File | void => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    state.fileImage = file;
    state.isEditAvatar = true;
    return file;
  };

  const closeEditProfileIcon = (): void => {
    state.isEditAvatar = false;
  };

  const onSaveAvatar = async (file: File): Promise<void> => {
    const url = await uploadFile(file);
    model.value = { ...model.value, avatarUrl: url };
  };

  const handleSave = async (config: { name: string }): Promise<void> => {
    model.value = { ...model.value, ...config };
  };

  const leaveGroupInfo = async (): Promise<void> => {
    try {
      if (model.value?.groupId) {
        const { quitGroup } = useGroup();
        await quitGroup(model.value?.groupId);
        currentRoute.value = { type: RouteTypes.GROUP, id: null };
        requestAnimationFrame(() => window.location.reload());
      }
    } catch (error) {
      console.error('Failed to leave group or delete friend:', error);
    }
  };

  const getMuteStatus = async (contact?: {
    groupId?: string;
    userId?: string;
    topicId?: string;
  }): Promise<boolean> => {
    const targetContact = contact || model.value;
    if (!targetContact?.topicId) return false;
    return false;
  };

  return {
    model,
    state,
    init,
    openEditProfileIcon,
    onOpenEditAvatar,
    closeEditProfileIcon,
    onSaveAvatar,
    handleSave,
    getMuteStatus,
    leaveGroupInfo
  };
}
