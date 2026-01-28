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
      :disabled="!isEditable"
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
      :disabled="!isEditable"
      @change="handleImagePublish"
    />
    <NewChatInformationForm
      :is-button-for-save="props.isButtonForSave"
      :model-value="form"
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
      v-if="props.isMenuInfo"
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
      :contacts="props.members"
      :excluded-contact-ids="excludedContactIds"
      class="modal-info-mobile__contact-list"
      :data-testid="`${props.dataTestid}-Header-ContactListInModal`"
      @unmount-click-add-button="handleContactClick"
    />
  </div>
</template>

<script lang="ts" setup>
import { useTemplateRef, computed } from 'vue';
import { Avatar } from '@pksep/yui';
import NewChatInformationForm from '../NewChat/NewChatInformationForm.vue';
import MenuInfoButtons from '../MenuInfoButtons.vue';
import ContactListInModal from '../ContactList/ContactListInModal.vue';
import { IMenuInfoInformation } from '../../composables/useMenuInfo';
import type { IUser } from '../interfaces/interfaces';
import { getConfig } from '../../services/useConfig';
import { uploadFile } from '../../services/useChat';
import { useInformationMenu } from '../../composables/useInformationMenu';
import {
  currentGroup,
  setGroupInfo,
  useGroup
} from '../../composables/useGroup';
import { useNewInformationModal } from '../../composables/useNewInformationModal';

interface IMobileChatInfoProps {
  members: IUser[];
  dataTestid?: string;
  isMenuInfo?: boolean;
  isButtonForSave?: boolean;
  excludedContactIds?: Set<string | number>;
}

const props = withDefaults(defineProps<IMobileChatInfoProps>(), {
  excludedContactIds: () => new Set<string | number>(),
  dataTestid: 'MobileChatInfo'
});

const excludedContactIds = computed(() => {
  const ids = new Set<string | number>();
  props.members?.forEach(contact => {
    if (contact?.id) ids.add(contact.id);
  });
  return ids;
});

const { isCurrentUserGroupAdmin } = useGroup();
const isEditable = computed(() => isCurrentUserGroupAdmin.value);

const information = defineModel<IMenuInfoInformation>();
const config = getConfig();
const avatarInputRef = useTemplateRef('avatarInputRef');

const { form } = useNewInformationModal(information.value);

const { leaveGroupInfo, onOpenEditAvatar, openEditProfileIcon } =
  useInformationMenu(information);

const handleUnmountLeave = () => {
  leaveGroupInfo();
};

const handleEditProfileIcon = () => {
  if (!isEditable.value) return;
  openEditProfileIcon(avatarInputRef.value);
};

const handleImagePublish = async (event: Event) => {
  const localFile = onOpenEditAvatar(event);
  if (!localFile) return;

  const file = await uploadFile(localFile);

  if (!file) return;

  await setGroupInfo(currentGroup.value.group.id, {
    faceURL: file.path,
    groupName: currentGroup.value.group.title
  });

  information.value.avatarUrl = file.path;
};

// Handle saving information form
const handleImageSave = (data: { name: string; avatarUrl?: string }) => {
  information.value = {
    ...information.value,
    ...data
  };
};

const handleContactClick = (): void => {};
</script>
