<template>
  <MobileModal
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
        :contacts="props.contacts"
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
    @unmount-next="handleCreateMobileGroup"
    start-button-text="Создать"
    close-button-text="Назад"
    :data-testid="`${props.dataTestid}-NewChatMobileModal-GroupModal`"
  >
    <MobileChatInfo
      :model-value="state.information"
      @update:model-value="handleCreateInformation"
      :members="selectedContacts"
      :data-testid="`${props.dataTestid}-NewChatMobileModal-MobileChatInfo`"
    />
  </MobileModal>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import MobileModal from '../UI/MobileModal.vue';
import ContactSelector from './ContactSelector.vue';
import MobileChatInfo from '../Header/MobileChatInfo.vue';
import {
  INewChatMobileProps,
  INewChatMobileEmits
} from './interfaces/contact-selector';
import { useNewGroupModal } from './composables/useNewGroupModal';
import { IUser } from '../interfaces/interfaces';

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

const state = reactive({
  checkMembers: [],
  information: {
    name: groupName.value,
    avatarUrl: avatarPreview.value,
    groupId: null,
    userId: props.user?.id,
    date: new Date()
  }
});

const handleCloseModal = () => {
  state.checkMembers = [];
  closeModal();
  emits('unmount-close');
};

const handleCheckUsers = (contacts: IUser[] | IUser): void => {
  if (props.isAddOne) {
    emits('unmount-contact', contacts);
    return;
  }
  if (Array.isArray(contacts) && contacts.length > 0) {
    state.checkMembers = contacts;
  }
};

const handleNext = (contacts: IUser[]): void => {
  if (props.isAddOne) return;
  state.information.name = createNiceName(contacts);
  handleOpenGroupInfo(contacts);
};

const handleCreateInformation = ({ avatarUrl, name }) => {
  avatarPreview.value = avatarUrl;
  state.information.avatarUrl = avatarUrl;
  state.information.name = name;
  groupName.value = name;
};

const handleCreateMobileGroup = () => {
  handleCreateGroup();
  state.information = {
    name: groupName.value,
    avatarUrl: null,
    groupId: null,
    userId: props.user?.id,
    date: new Date()
  };
};
</script>
