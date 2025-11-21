<template>
  <div class="menu-info__create-channel" :data-testid="dataTestid">
    <p class="menu-info__title-text">Канал создан:</p>
    <span>
      {{ model.date?.toLocaleDateString('ru-RU') }}
    </span>
  </div>
  <button class="menu-info__avatar-button" @click="openEditProfileIcon">
    <Avatar
      :initials="model.name"
      :url="model.avatarUrl"
      alt="use-avatar-circle"
    />
  </button>
  <input
    v-show="false"
    ref="avatarInputRef"
    type="file"
    accept="image/*"
    @change="onOpenEditAvatar"
  />
  <ModalCroppedAvatar
    :image="state.fileImage"
    :open="state.isEditAvatar"
    @unmount-close="closeEditProfileIcon"
    @unmount-save="onSaveAvatar"
  />
  <MenuInfoButtons
    @unmount-mute="muteGroupInfo"
    @unmount-leave="leaveGroupInfo"
  />
  <NewChatInformationForm :model-value="model" @unmount-save="handleSave" />
</template>

<script lang="ts" setup>
import { reactive } from 'vue';
import { quitGroup } from '../services/useGroup';
import { ModalCroppedAvatar, Avatar } from '@pksep/yui';
import NewChatInformationForm from './NewChat/NewChatInformationForm.vue';
import MenuInfoButtons from './MenuInfoButtons.vue';
import { IMSDK, uploadFile } from '../services/useOpenIM';
import { onMounted } from 'vue';
import { useTemplateRef } from 'vue';

type Props = {
  groupId: string;
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  date: Date | null;
};

withDefaults(
  defineProps<{
    dataTestid?: string;
  }>(),
  {}
);

const model = defineModel<Props>();

const avatarInputRef = useTemplateRef('avatarInputRef');

const state = reactive({
  fileImage: null as File | null,
  isEditAvatar: false
});

const handleSave = async (config: { name: string }): Promise<void> => {
  model.value = { ...model.value, ...config };
};

const muteGroupInfo = async (isMute: boolean): Promise<void> => {
  if (model.value?.groupId) {
    await IMSDK.changeGroupMute({ groupID: model.value?.groupId, isMute });
  }
};

const leaveGroupInfo = async (): Promise<void> => {
  if (!model.value?.groupId) {
    await quitGroup(model.value?.groupId);
  } else {
    await IMSDK.deleteFriend(model.value?.userId);
  }
  window.location.reload();
};

const openEditProfileIcon = (): void => {
  avatarInputRef.value?.click();
};

const closeEditProfileIcon = (): void => {
  state.isEditAvatar = false;
};

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

const onOpenEditAvatar = (e: Event): void => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  state.fileImage = file;
  state.isEditAvatar = true;
};

const onSaveAvatar = async (file: File): Promise<void> => {
  const url = await uploadFile(file);
  model.value = { ...model.value, avatarUrl: url };
};

onMounted(async () => {
  state.fileImage = await pathToFile(model.value?.avatarUrl);
});
</script>
