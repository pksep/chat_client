import { reactive, Ref } from 'vue';
import { quitGroup } from '../services/useGroup';
import { getChatSDK, getCurrentUserId, uploadFile } from '../services/useChat';
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

  const muteGroupInfo = async (
    isMute: boolean,
    contact?: { groupId?: string; userId?: string; topicId?: string }
  ): Promise<void> => {
    const targetContact = contact || model.value;
    const topicId = targetContact?.topicId;

    if (!topicId) {
      console.warn('No topic ID provided for muting conversation');
      return;
    }

    try {
      const sdk = getChatSDK();
      const currentUserId = getCurrentUserId();
      if (!currentUserId) return;

      if (isMute) {
        await sdk.muteTopic(topicId, currentUserId);
      } else {
        await sdk.unmuteTopic(topicId, currentUserId);
      }
    } catch (error) {
      console.error('Failed to update topic mute status:', error);
      throw error;
    }
  };

  const leaveGroupInfo = async (): Promise<void> => {
    try {
      if (model.value?.groupId) {
        await quitGroup(model.value?.groupId);
      }
    } catch (error) {
      const errorDetails = {
        error: error,
        operation: model.value?.groupId ? 'quitGroup' : 'leaveDirectChat',
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
    muteGroupInfo,
    getMuteStatus,
    leaveGroupInfo
  };
}
