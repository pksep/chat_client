<template>
  <MobileModal
    :open="props.open"
    @unmount-close="handleCloseModal"
    @unmount-next="handleStartStep"
    :title="props.isAddOne ? 'Написать сообщение' : 'Канал'"
    start-button-text="Далее"
    back-button-text="Отмена"
  >
    <template #default>
      <ContactSelector
        class="mobile__list-modal__contact-selector"
        :is-add-one="props.isAddOne"
        :contacts="props.contacts"
        :selected-contact-ids="props.selectedContactIds"
        @unmount-contact="handleUnmountContact"
        @unmount-close="handleCloseModal"
      />
    </template>
  </MobileModal>
  <MobileModal
    :open="state.openEdit"
    @close="state.openEdit = false"
    title="Канал"
    @unmount-next="handleMessage"
    start-button-text="Создать"
    back-button-text="Отмена"
  >
    <MobileChatInfo :data-testid="props.dataTestid" />
  </MobileModal>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { IContactProps } from '../interfaces/interfaces';
import MobileModal from '../UI/MobileModal.vue';
import ContactSelector from './ContactSelector.vue';
import MobileChatInfo from '../Header/MobileChatInfo.vue';
import {
  INewChatMobileProps,
  INewChatMobileEmits
} from './interfaces/contact-selector';

const props = withDefaults(defineProps<INewChatMobileProps>(), {
  open: false,
  contacts: () => []
});

const emits = defineEmits<INewChatMobileEmits>();

const {
  state,
  checkGroupId,
  handleCloseMenu,
  handleContactClick,
  handleNewContact,
  handleUpdateInformation,
  handleCloseAddUserModal
} = useMenuInfo(props, emits);

const state = reactive({
  selectedContacts: [] as IContactProps[],
  openEdit: false
});

const handleCloseModal = () => {
  emits('unmount-close');
};

const handleUnmountContact = (contact: IContactProps[]) => {
  state.selectedContacts = contact;
  emits('unmount-contact', contact);
};

const handleStartStep = () => {
  state.openEdit = true;
};

const handleMessage = () => {
  state.openEdit = false;
  emits('unmount-chapter');
};
</script>
