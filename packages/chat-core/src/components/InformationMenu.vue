<template>
  <div class="menu-info__create-channel">
    <p class="menu-info__title-text">Канал создан:</p>
    <span>
      {{ model.date }}
    </span>
  </div>
  <button class="menu-info__avatar-button" @click="openEditProfileIcon">
    <Avatar is-icon :url="model.avatarUrl" alt="use-avatar-circle" />
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
  <MenuInfoButtons @unmount-leave="leaveGroupInfo" />
  <NewChatInformationForm :model-value="model" @unmount-save="handleSave" />
</template>

<script lang="ts" setup>
import { reactive } from 'vue';
import { quitGroup } from '../services/useGroup';
import { ModalCroppedAvatar, Avatar } from '@pksep/yui';
import NewChatInformationForm from './NewChat/NewChatInformationForm.vue';
import MenuInfoButtons from './MenuInfoButtons.vue';
import { uploadFile } from '../services/useOpenIM';
import { onMounted } from 'vue';
import { useTemplateRef } from 'vue';

type Props = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  date: string | null;
};

// const props = withDefaults(defineProps<Props>(), {});

const model = defineModel<Props>();

const avatarInputRef = useTemplateRef('avatarInputRef');

const state = reactive({
  fileImage: null as File | null,
  isEditAvatar: false
});

const handleSave = async (config: { name: string }): Promise<void> => {
  model.value = { ...model.value, ...config };
};

const leaveGroupInfo = async (): Promise<void> => {
  await quitGroup(model.value?.id);
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
