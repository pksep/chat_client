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
  <ModalCroppedAvatar
    :image="null"
    :open="state.isEditAvatar"
    @unmount-close="closeEditProfileIcon"
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

type Props = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  date: string | null;
};

// const props = withDefaults(defineProps<Props>(), {});

const model = defineModel<Props>();

const state = reactive({
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
  state.isEditAvatar = true;
};

const closeEditProfileIcon = (): void => {
  state.isEditAvatar = false;
};
</script>
