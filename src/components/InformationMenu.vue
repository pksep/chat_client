<template>
  <div
    class="menu-info__create-channel"
    :data-testid="`${dataTestid}-InformationMenu-Container`"
  >
    <p class="menu-info__title-text">Канал создан:</p>
    <span>
      {{ model?.date?.toLocaleDateString('ru-RU') }}
    </span>
  </div>
  <button class="menu-info__avatar-button" @click="openEditProfileIcon">
    <Avatar
      :initials="model?.name"
      :url="`${config.CHAT_PATH_TO_FILE_CDN}/${model?.avatarUrl}`"
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
  <MenuInfoButtons @unmount-leave="leaveGroupInfo" />
  <NewChatInformationForm
    :model-value="model"
    @unmount-save="handleSaveFromForm"
  />
</template>

<script lang="ts" setup>
import { onMounted } from 'vue';
import { useTemplateRef } from 'vue';
import { useInformationMenu } from '../composables/useInformationMenu';
import { ModalCroppedAvatar, Avatar } from '@pksep/yui';
import NewChatInformationForm from './NewChat/NewChatInformationForm.vue';
import MenuInfoButtons from './MenuInfoButtons.vue';
import type { IMenuInfoInformation } from '../composables/useMenuInfo';
import { getConfig } from '../services/useConfig';

withDefaults(
  defineProps<{
    modelValue?: IMenuInfoInformation;
    dataTestid?: string;
  }>(),
  {
    dataTestid: () => 'InformationMenu'
  }
);

const model = defineModel<IMenuInfoInformation>();

const avatarInputRef = useTemplateRef('avatarInputRef');

const config = getConfig();

const {
  state,
  init,
  openEditProfileIcon: composableOpenEditProfileIcon,
  onOpenEditAvatar,
  closeEditProfileIcon,
  onSaveAvatar: originalOnSaveAvatar,
  leaveGroupInfo
} = useInformationMenu(model);

const onSaveAvatar = async (file: File): Promise<void> => {
  await originalOnSaveAvatar(file);
};

const handleSaveFromForm = (value: { name: string; avatarUrl?: string }) => {
  const updatedValue = {
    ...model.value,
    name: value.name,
    avatarUrl: value.avatarUrl
  };
  model.value = updatedValue;
};

const openEditProfileIcon = () =>
  composableOpenEditProfileIcon(avatarInputRef.value);

onMounted(async () => {
  await init();
});
</script>
