<template>
  <MobileModal
    :class="props.isAddOne ? 'modal__new-contact' : 'modal__new-group'"
    :open="props.open"
    @unmount-close="handleCloseModal"
    @unmount-next="handleNext(state.checkMembers)"
    :title="props.isAddOne ? 'Написать сообщение' : 'Канал'"
    :start-button-text="props.isAddOne ? null : 'Далее'"
    :close-button-text="props.isAddOne ? 'Отмена' : 'Назад'"
    :is-disabled-start-button="state.checkMembers.length === 0"
    :data-testid="`${props.dataTestid}-NewChatMobileModal-Container`"
  >
    <template #default>
      <ContactSelector
        class="mobile__list-modal__contact-selector"
        :is-add-one="props.isAddOne"
        is-button-disabled
        :contacts="filteredContacts"
        :selected-contact-ids="props.selectedContactIds"
        :excluded-contact-ids="props.excludedContactIds"
        @unmount-contact="handleCheckUsers"
        @unmount-close="handleCloseModal"
      />
    </template>
  </MobileModal>
  <MobileModal
    :open="isSelectedMembers"
    @unmount-close="handleCloseGroupInfo"
    title="Канал"
    class="modal__new-group"
    @unmount-next="handleCreateMobileGroup"
    start-button-text="Создать"
    :is-disabled-start-button="state.disableCreateButton"
    close-button-text="Назад"
    :data-testid="`${props.dataTestid}-NewChatMobileModal-GroupModal`"
  >
    <MobileChatInfo
      :is-button-for-save="false"
      :model-value="form"
      :members="filteredSelectedContacts"
      :data-testid="`${props.dataTestid}-NewChatMobileModal-MobileChatInfo`"
      @unmount-added-users="handleAddUsers"
    />
  </MobileModal>
</template>

<script setup lang="ts">
import { reactive, computed } from 'vue';
import MobileModal from '../UI/MobileModal.vue';
import ContactSelector from './ContactSelector.vue';
import MobileChatInfo from '../Header/MobileChatInfo.vue';
import {
  INewChatMobileProps,
  INewChatMobileEmits
} from './interfaces/contact-selector';
import { useNewGroupModal } from './composables/useNewGroupModal';
import { IUser } from '../interfaces/interfaces';
import { getChatSDK } from '../../services/useChat';
import { navigateToDialogs } from '../../composables/navigation';
import { useNewInformationModal } from '../../composables/useNewInformationModal';

const props = withDefaults(defineProps<INewChatMobileProps>(), {
  open: false,
  contacts: () => [],
  dataTestid: () => 'NewChatMobileModal'
});

const emits = defineEmits<INewChatMobileEmits>();

const {
  groupName,
  selectedContacts,
  isSelectedMembers,
  avatarPreview,
  handleCreateGroup,
  createNiceName,
  closeModal,
  handleOpenGroupInfo,
  handleCloseGroupInfo
} = useNewGroupModal(props, emits);

const filteredContacts = computed<IUser[]>(() => {
  return props.contacts.filter(
    contact =>
      contact &&
      typeof contact === 'object' &&
      'initials' in contact &&
      'nickname' in contact &&
      'lastOnline' in contact
  ) as IUser[];
});

const filteredSelectedContacts = computed<IUser[]>(() => {
  return selectedContacts.value.filter(
    contact =>
      contact &&
      typeof contact === 'object' &&
      'initials' in contact &&
      'nickname' in contact &&
      'lastOnline' in contact
  ) as IUser[];
});

const state = reactive({
  checkMembers: [],
  disableCreateButton: false
});

const { form, handleUpdateInformation } = useNewInformationModal({
  name: '',
  avatarUrl: ''
});

const handleCloseModal = () => {
  state.checkMembers = [];
  closeModal();
  emits('unmount-close');
};

const handleCheckUsers = async (contacts: IUser[] | IUser): Promise<void> => {
  const sdk = getChatSDK();
  if (props.isAddOne && 'id' in contacts && contacts.id) {
    const topic = await sdk.createTopic({ peerId: contacts.id });
    navigateToDialogs(topic.id as string);
    return;
  } else {
    if (Array.isArray(contacts) && contacts.length > 0) {
      state.checkMembers = contacts;
    }
  }
};

const handleNext = (contacts: IUser[]): void => {
  if (props.isAddOne) return;
  const name = createNiceName(contacts);
  handleUpdateInformation({ avatarUrl: form.avatarUrl, name });
  handleOpenGroupInfo(contacts);
};

const handleCreateInformation = ({ avatarUrl, name }) => {
  avatarPreview.value = avatarUrl;
  groupName.value = name;
};

const handleCreateMobileGroup = async () => {
  state.disableCreateButton = true;
  handleCreateInformation(form);
  await handleCreateGroup();
  state.disableCreateButton = false;
};

const handleAddUsers = (addedUsers: IUser[]) => {
  handleOpenGroupInfo([
    ...filteredSelectedContacts.value.slice(1),
    ...addedUsers
  ]);
};
</script>
