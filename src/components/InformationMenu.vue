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
    <CachedAvatar
      :initials="model?.name"
      :path="model?.avatarUrl"
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
  <NewChatInformationForm @unmount-save="handleSaveFromForm" />
</template>

<script lang="ts" setup>
import { useTemplateRef } from 'vue';
import { useInformationMenu } from '../composables/useInformationMenu';
import { ModalCroppedAvatar } from '@pksep/yui';
import NewChatInformationForm from './NewChat/NewChatInformationForm.vue';
import MenuInfoButtons from './MenuInfoButtons.vue';
import type { IMenuInfoInformation } from '../composables/useMenuInfo';
import CachedAvatar from './UI/CachedAvatar.vue';

const props = withDefaults(
  defineProps<{
    modelValue?: IMenuInfoInformation;
    dataTestid?: string;
    isAdmin?: boolean;
  }>(),
  {
    dataTestid: () => 'InformationMenu',
    isAdmin: false
  }
);

const model = defineModel<IMenuInfoInformation>();

const avatarInputRef = useTemplateRef('avatarInputRef');

const {
  state,
  openEditProfileIcon: composableOpenEditProfileIcon,
  onOpenEditAvatar,
  closeEditProfileIcon,
  onSaveAvatar: originalOnSaveAvatar,
  leaveGroupInfo
} = useInformationMenu(model);

const onSaveAvatar = async (): Promise<void> => {
  if (state.fileImage) {
    await originalOnSaveAvatar(state.fileImage);
  }
};

const handleSaveFromForm = (value: { name: string }) => {
  const updatedValue = {
    ...model.value,
    name: value.name
  };
  model.value = updatedValue;
};

const openEditProfileIcon = () => {
  if (!props.isAdmin) return;
  composableOpenEditProfileIcon(avatarInputRef.value);
};
</script>
