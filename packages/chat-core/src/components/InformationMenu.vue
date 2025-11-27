<template>
  <div class="menu-info__create-channel" :data-testid="dataTestid">
    <p class="menu-info__title-text">Канал создан:</p>
    <span>
      {{ model?.date?.toLocaleDateString('ru-RU') }}
    </span>
  </div>
  <button class="menu-info__avatar-button" @click="openEditProfileIcon">
    <Avatar
      :initials="model?.name"
      :url="model?.avatarUrl"
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
import { onMounted } from 'vue';
import { useTemplateRef } from 'vue';
import { useInformationMenu } from '../composables/useInformationMenu';
import { ModalCroppedAvatar, Avatar } from '@pksep/yui';
import NewChatInformationForm from './NewChat/NewChatInformationForm.vue';
import MenuInfoButtons from './MenuInfoButtons.vue';
import type { IMenuInfoInformation } from '../composables/useMenuInfo';

withDefaults(
  defineProps<{
    modelValue?: IMenuInfoInformation;
    dataTestid?: string;
  }>(),
  {}
);

const model = defineModel<IMenuInfoInformation>();

const avatarInputRef = useTemplateRef('avatarInputRef');

const {
  state,
  init,
  openEditProfileIcon: composableOpenEditProfileIcon,
  onOpenEditAvatar,
  closeEditProfileIcon,
  onSaveAvatar,
  handleSave,
  muteGroupInfo,
  leaveGroupInfo
} = useInformationMenu(model);

const openEditProfileIcon = () =>
  composableOpenEditProfileIcon(avatarInputRef.value);

onMounted(async () => {
  await init();
});
</script>
