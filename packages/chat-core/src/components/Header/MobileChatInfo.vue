<template>
  <div
    class="modal-info-mobile__start"
    :data-testid="`${props.dataTestid}-Header-ModalStartContainer`"
  >
    <Avatar
      is-icon
      class="modal-info-mobile__avatar"
      :data-testid="`${props.dataTestid}-Header-ModalAvatar`"
    />
    <NewChatInformationForm
      v-model="information"
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
import type { IUserProps } from '../interfaces/interfaces';
import { Avatar } from '@pksep/yui';
import NewChatInformationForm from '../NewChat/NewChatInformationForm.vue';
import MenuInfoButtons from '../MenuInfoButtons.vue';
import ContactListInModal from '../ContactList/ContactListInModal.vue';
import { IMenuInfoInformation } from '../../composables/useMenuInfo';

interface IMobileChatInfoProps {
  members: IUserProps[];
  dataTestid: string;
}

const props = defineProps<IMobileChatInfoProps>();

const emits = defineEmits<{
  (e: 'unmount-mute'): void;
  (e: 'unmount-leave'): void;
}>();

const information = defineModel<IMenuInfoInformation>({
  default: { name: '' }
});

const handleUnmountLeave = () => {
  emits('unmount-leave');
};

const handleMute = () => {
  emits('unmount-mute');
};
</script>
