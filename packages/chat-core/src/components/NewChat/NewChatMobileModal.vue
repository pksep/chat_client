<template>
  <MobileModal
    :open="props.open"
    @unmount-close="handleCloseModal"
    @unmount-next="handleNext(state.checkMembers)"
    title="Написать сообщение"
    :start-button-text="props.isAddOne ? null : 'Далее'"
    back-button-text="Отмена"
  >
    <template #default>
      <ContactSelector
        class="mobile__list-modal__contact-selector"
        :is-add-one="props.isAddOne"
        is-button-disabled
        :contacts="props.contacts"
        :selected-contact-ids="props.selectedContactIds"
        @unmount-contact="handleCheckUsers"
        @unmount-close="handleCloseModal"
      />
    </template>
  </MobileModal>
  <MobileModal
    :open="isSelectedMembers"
    @unmount-close="handleCloseGroupInfo"
    title="Канал"
    @unmount-next="handleCreateGroup"
    start-button-text="Создать"
    back-button-text="Отмена"
  >
    <MobileChatInfo
      :model-value="state.information"
      @update:model-value="handleCreateInformation"
      :members="selectedContacts"
      :data-testid="props.dataTestid"
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
import { IUserProps } from '../interfaces/interfaces';

const props = withDefaults(defineProps<INewChatMobileProps>(), {
  open: false,
  contacts: () => []
});

const emits = defineEmits<INewChatMobileEmits>();

const {
  groupName,
  selectedContacts,
  isSelectedMembers,
  avatarPreview,
  handleCreateGroup,
  createNiceName,
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
  emits('unmount-close');
};

const handleCheckUsers = (contacts: IUserProps[] | IUserProps): void => {
  if (props.isAddOne) {
    emits('unmount-contact', contacts);
  }
  if (Array.isArray(contacts) && contacts.length > 0) {
    state.checkMembers = contacts;
  }
};

const handleNext = (contacts: IUserProps[]): void => {
  if (props.isAddOne) return;
  state.information.name = createNiceName(contacts);
  handleOpenGroupInfo(contacts);
};

const handleCreateInformation = ({ avatarUrl, name }) => {
  avatarPreview.value = avatarUrl;
  groupName.value = name;
};
</script>
