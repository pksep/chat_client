<template>
  <button
    class="menu-info__avatar-button"
    :data-testid="`${dataTestid}-InformationMenu-AvatarButton`"
    @click="openEditProfileIcon"
  >
    <CachedAvatar
      :initials="model?.name"
      :path="model?.avatarUrl"
      alt="Аватар группы"
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
  <NewChatInformationForm
    class="menu-info__name-form"
    :name="model?.name"
    @unmount-save="handleSaveFromForm"
  />
  <MenuInfoButtons
    @unmount-leave="leaveGroupInfo"
    @unmount-open-chat="emits('unmount-open-chat')"
  />
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

const emits = defineEmits<{
  (e: 'unmount-open-chat'): void;
}>();

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

const onSaveAvatar = async (croppedFile?: File): Promise<void> => {
  const avatarFile = croppedFile || state.fileImage;

  if (avatarFile) {
    await originalOnSaveAvatar(avatarFile);
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
