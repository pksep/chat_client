<template>
  <div class="menu-info__create-channel">
    <p class="menu-info__title-text">Канал создан:</p>
    <span>
      {{ props.date }}
    </span>
  </div>
  <button class="menu-info__avatar-button" @click="openEditProfileIcon">
    <Avatar is-icon :url="props.avatarUrl" alt="use-avatar-circle" />
  </button>
  <ModalCroppedAvatar
    :image="null"
    :open="state.isEditAvatar"
    @unmount-close="closeEditProfileIcon"
  />
  <MenuInfoButtons />
  <NewChatInformationForm :name="props.name" />
</template>

<script lang="ts" setup>
import { reactive } from 'vue';
import { ModalCroppedAvatar, Avatar } from '@pksep/yui';
import NewChatInformationForm from './NewChat/NewChatInformationForm.vue';
import MenuInfoButtons from './MenuInfoButtons.vue';

type Props = {
  name: string | null;
  avatarUrl: string | null;
  date: string | null;
};

const props = withDefaults(defineProps<Props>(), {});

const state = reactive({
  isEditAvatar: false
});

const openEditProfileIcon = (): void => {
  state.isEditAvatar = true;
};

const closeEditProfileIcon = (): void => {
  state.isEditAvatar = false;
};
</script>
