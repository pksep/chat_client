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
      <Avatar
        is-icon
        :url="`${config.CHAT_PATH_TO_FILE_CDN}/${information?.avatarUrl}`"
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
    <NewChatInformationForm
      :model-value="information"
      :disabled-form="props.isMenuInfo"
      @unmount-save="handleImageSave"
      :data-testid="`${props.dataTestid}-Header-InformationForm`"
    >
      <template #button>
        <template v-if="props.isMenuInfo">{{}}</template>
      </template>
    </NewChatInformationForm>
  </div>
  <div
    class="modal-info-mobile__end"
    :data-testid="`${props.dataTestid}-Header-ModalEndContainer`"
  >
    <MenuInfoButtons
      :data-testid="`${props.dataTestid}-Header-MenuInfoButtons`"
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
import type { IUser } from '../interfaces/interfaces';
import { Avatar } from '@pksep/yui';
import NewChatInformationForm from '../NewChat/NewChatInformationForm.vue';
import MenuInfoButtons from '../MenuInfoButtons.vue';
import ContactListInModal from '../ContactList/ContactListInModal.vue';
import { IMenuInfoInformation } from '../../composables/useMenuInfo';
import { useInformationMenu } from '../../composables/useInformationMenu';
import { onMounted } from 'vue';
import { getConfig } from '../../services/useConfig';

interface IMobileChatInfoProps {
  members: IUser[];
  dataTestid?: string;
  isMenuInfo?: boolean;
}

const props = withDefaults(defineProps<IMobileChatInfoProps>(), {
  dataTestid: () => 'MobileChatInfo'
});

const information = defineModel<IMenuInfoInformation>();

const config = getConfig();

const avatarInputRef = useTemplateRef('avatarInputRef');

const {
  state: stateInfo,
  init,
  leaveGroupInfo,
  onSaveAvatar,
  onOpenEditAvatar,
  openEditProfileIcon
} = useInformationMenu(information);

const handleUnmountLeave = () => {
  leaveGroupInfo();
};

const handleEditProfileIcon = () => {
  openEditProfileIcon(avatarInputRef.value);
};

const handleImagePublish = async (event: Event) => {
  const file = onOpenEditAvatar(event);
  if (!file) return;
  stateInfo.fileImage = file;
  if (stateInfo.fileImage) {
    await onSaveAvatar(stateInfo.fileImage);
  }
};

const handleImageSave = async (config: {
  name: string;
  avatarUrl?: string;
}) => {
  information.value = {
    ...information.value,
    ...config
  };
};

onMounted(async () => {
  await init();
});
</script>
