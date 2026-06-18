<template>
  <div
    :class="[
      'modal-info-mobile__start',
      { 'modal-info-mobile__start--disabled': props.isMenuInfo }
    ]"
    :data-testid="`${props.dataTestid}-Header-ModalStartContainer`"
  >
    <button
      class="modal-info-mobile__avatar-button"
      @click="handleEditProfileIcon"
    >
      <CachedAvatar
        is-icon
        :path="information?.avatarUrl"
        :initials="information?.name"
        :caption="`image with a channel ${information?.name}`"
        class="modal-info-mobile__avatar"
        :data-testid="`${props.dataTestid}-Header-ModalAvatar`"
      />
    </button>
    <input
      v-show="false"
      ref="avatarInputRef"
      type="file"
      accept="image/*"
      @change="handleImagePublish"
    />
    <ModalCroppedAvatar
      :image="informationState.fileImage"
      :open="informationState.isEditAvatar"
      @unmount-close="handleCloseImageCrop"
      @unmount-save="handleImageCropSave"
    />
    <NewChatInformationForm
      :name="information?.name"
      @unmount-save="handleSaveFromForm"
      @unmount-change="handleChangeFromForm"
      :data-testid="`${props.dataTestid}-Header-InformationForm`"
    />
  </div>
  <div
    class="modal-info-mobile__end"
    :data-testid="`${props.dataTestid}-Header-ModalEndContainer`"
  >
    <MenuInfoButtons
      v-if="props.isMenuInfo"
      :data-testid="`${props.dataTestid}-Header-MenuInfoButtons`"
      @unmount-leave="handleUnmountLeave"
      @unmount-open-chat="emits('unmount-open-chat')"
    />
    <p
      class="modal-info-mobile__end--paragraph"
      :data-testid="`${props.dataTestid}-Header-ParticipantsLabel`"
    >
      Участники:
    </p>
    <ContactListInModal
      :show-add-button="props.showAddButton"
      :contacts="props.members"
      :excluded-contact-ids="excludedContactIds"
      class="modal-info-mobile__contact-list"
      :data-testid="`${props.dataTestid}-Header-ContactListInModal`"
      @unmount-added-users="handleContactClick"
    />
  </div>
</template>

<script lang="ts" setup>
import { useTemplateRef, computed } from 'vue';
import { ModalCroppedAvatar } from '@pksep/yui';
import NewChatInformationForm from '../NewChat/NewChatInformationForm.vue';
import MenuInfoButtons from '../MenuInfoButtons.vue';
import ContactListInModal from '../ContactList/ContactListInModal.vue';
import { IMenuInfoInformation } from '../../composables/useMenuInfo';
import type { IUser } from '../interfaces/interfaces';
import { useInformationMenu } from '../../composables/useInformationMenu';
import { uploadFile } from '../../services/useChat';
import { currentGroup, setGroupInfo } from '../../composables/useGroup';
import CachedAvatar from '../UI/CachedAvatar.vue';

interface IMobileChatInfoProps {
  members: IUser[];
  dataTestid?: string;
  isMenuInfo?: boolean;
  showAddButton?: boolean;
  excludedContactIds?: Set<string | number>;
}

const props = withDefaults(defineProps<IMobileChatInfoProps>(), {
  excludedContactIds: () => new Set<string | number>(),
  showAddButton: true,
  dataTestid: 'MobileChatInfo'
});

const emits = defineEmits<{
  (e: 'unmount-added-users', selectedUsers: IUser[]): void;
  (e: 'unmount-open-chat'): void;
}>();

const excludedContactIds = computed(() => {
  const ids = new Set<string | number>();
  props.members?.forEach(contact => {
    if (contact?.id) ids.add(contact.id);
  });
  return ids;
});

const information = defineModel<IMenuInfoInformation>();
const avatarInputRef = useTemplateRef('avatarInputRef');

const {
  state: informationState,
  leaveGroupInfo,
  onOpenEditAvatar,
  closeEditProfileIcon,
  openEditProfileIcon
} = useInformationMenu(information);

const handleUnmountLeave = () => {
  leaveGroupInfo();
};

const handleEditProfileIcon = () => {
  openEditProfileIcon(avatarInputRef.value);
};

const handleImagePublish = async (event: Event) => {
  const localFile = onOpenEditAvatar(event);

  if (!localFile && avatarInputRef.value) {
    avatarInputRef.value.value = '';
  }
};

const resetAvatarInput = (): void => {
  if (avatarInputRef.value) {
    avatarInputRef.value.value = '';
  }
};

const handleCloseImageCrop = (): void => {
  closeEditProfileIcon();
  resetAvatarInput();
};

const handleImageCropSave = async (croppedFile: File) => {
  const file = await uploadFile(croppedFile);

  if (!file) return;

  if (currentGroup.value) {
    await setGroupInfo(currentGroup.value.group.id, {
      avatarUrl: file.path
    });
  }

  information.value.avatarUrl = file.path;
  closeEditProfileIcon();
  resetAvatarInput();
};

const handleSaveFromForm = async (value: { name: string }) => {
  await setGroupInfo(currentGroup.value.group.id, {
    avatarUrl: currentGroup.value.group.avatarUrl,
    groupName: value.name
  });
};

const handleChangeFromForm = async (value: { name: string }) => {
  information.value.name = value.name;
};

const handleContactClick = (newUsers: IUser[]): void => {
  emits('unmount-added-users', newUsers);
};
</script>
