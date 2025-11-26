<template>
  <div
    class="modal-info-mobile__start"
    :data-testid="`${props.dataTestid}-Header-ModalStartContainer`"
  >
    <button
      class="modal-info-mobile__avatar-button"
      @click="handleEditProfileIcon"
    >
      <Avatar
        is-icon
        :url="information?.avatarUrl"
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
    <NewChatInformationForm
      :model-value="information"
      @unmount-save="handleImageSave"
      :data-testid="`${props.dataTestid}-Header-InformationForm`"
    >
      <template #button></template>
    </NewChatInformationForm>
  </div>
  <div
    class="modal-info-mobile__end"
    :data-testid="`${props.dataTestid}-Header-ModalEndContainer`"
  >
    <MenuInfoButtons
      :data-testid="`${props.dataTestid}-Header-MenuInfoButtons`"
      @unmount-mute="handleMute"
      @unmount-leave="handleUnmountLeave"
    />
    <p
      class="modal-info-mobile__end--paragraph"
      :data-testid="`${props.dataTestid}-Header-ParticipantsLabel`"
    >
      Участники:
    </p>
    <ContactListInModal
      :show-add-button="false"
      :contacts="props.members"
      class="modal-info-mobile__contact-list"
      :data-testid="`${props.dataTestid}-Header-ContactListInModal`"
    />
  </div>
</template>

<script lang="ts" setup>
import { useTemplateRef } from 'vue';
import type { IUserProps } from '../interfaces/interfaces';
import { Avatar } from '@pksep/yui';
import NewChatInformationForm from '../NewChat/NewChatInformationForm.vue';
import MenuInfoButtons from '../MenuInfoButtons.vue';
import ContactListInModal from '../ContactList/ContactListInModal.vue';
import { IMenuInfoInformation } from '../../composables/useMenuInfo';
import { useInformationMenu } from '../../composables/useInformationMenu';
import { onMounted } from 'vue';

interface IMobileChatInfoProps {
  members: IUserProps[];
  dataTestid: string;
}

const props = defineProps<IMobileChatInfoProps>();

const information = defineModel<IMenuInfoInformation>();

const avatarInputRef = useTemplateRef('avatarInputRef');

const {
  state: stateInfo,
  init,
  muteGroupInfo,
  leaveGroupInfo,
  onSaveAvatar,
  onOpenEditAvatar,
  openEditProfileIcon
} = useInformationMenu(information);

const handleUnmountLeave = () => {
  leaveGroupInfo();
};

const handleMute = (isMute: boolean) => {
  muteGroupInfo(isMute);
};

const handleEditProfileIcon = () => {
  openEditProfileIcon(avatarInputRef.value);
};

const handleImagePublish = (event: Event) => {
  const file = onOpenEditAvatar(event);
  if (!file) return;
};

const handleImageSave = async (config: { name: string }) => {
  information.value = { ...information.value, ...config };
  if (stateInfo.fileImage) {
    await onSaveAvatar(stateInfo.fileImage);
  }
};

onMounted(async () => {
  await init();
});
</script>
