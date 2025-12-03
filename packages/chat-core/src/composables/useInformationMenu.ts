import { reactive, Ref } from 'vue';
import { quitGroup } from '../services/useGroup';
import { IMSDK, uploadFile } from '../services/useOpenIM';
import { IMenuInfoInformation } from './useMenuInfo';

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

  const muteGroupInfo = async (isMute: boolean): Promise<void> => {
    if (model.value?.groupId) {
      await IMSDK.changeGroupMute({ groupID: model.value.groupId, isMute });
    }
  };

  const leaveGroupInfo = async (): Promise<void> => {
    try {
      if (model.value?.groupId) {
        await quitGroup(model.value?.groupId);
      } else {
        await IMSDK.deleteFriend(model.value?.userId);
      }
      window.location.reload();
    } catch (error) {
      const errorDetails = {
        error: error,
        operation: model.value?.groupId ? 'quitGroup' : 'deleteFriend',
        groupID: model.value?.groupId || null,
        userID: model.value?.userId || null,
        timestamp: new Date().toISOString(),
        operationID: error?.operationID || error?.data?.operationID || null,
        event: error?.event || error?.data?.event || null,
        errorMessage: error?.errorMessage || error?.message || 'Unknown error'
      };

      console.error('Failed to leave group or delete friend:', errorDetails);

      if (error?.operationID) {
        console.info(`Operation ID: ${error.operationID}`);
      }
      if (error?.event) {
        console.info(`Event: ${error.event}`);
      }
    }
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
    muteGroupInfo,
    leaveGroupInfo
  };
}
