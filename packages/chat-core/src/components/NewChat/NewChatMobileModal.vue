<template>
  <MobileModal
    :open="props.open"
    @unmount-close="handleCloseModal"
    @unmount-next="handleStartStep"
    title="Написать сообщение"
    start-button-text="Далее"
    back-button-text="Отмена"
  >
    <template #default>
      <ContactSelector
        class="mobile__list-modal__contact-selector"
        :is-add-one="props.isAddOne"
        is-button-disabled
        :contacts="props.contacts"
        :selected-contact-ids="props.selectedContactIds"
        @unmount-contact="handleUpdateInformation"
        @unmount-close="handleCloseModal"
      />
    </template>
  </MobileModal>
  <MobileModal
    :open="additionalState.openEdit"
    @close="handleCloseAddUserModal"
    title="Канал"
    @unmount-next="handleMessage"
    start-button-text="Создать"
    back-button-text="Отмена"
  >
    <MobileChatInfo
      v-model="state.information"
      :members="props.contacts"
      :data-testid="props.dataTestid"
    />
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
import { useMenuInfo } from '../../composables/useMenuInfo';

const props = withDefaults(defineProps<INewChatMobileProps>(), {
  open: false,
  contacts: () => []
});

const emits = defineEmits<INewChatMobileEmits>();

const { state, handleUpdateInformation } = useMenuInfo(
  { ...props, members: props.contacts },
  emits
);

const additionalState = reactive({
  selectedContacts: [] as IContactProps[],
  openEdit: false
});

const handleCloseModal = () => {
  emits('unmount-close');
};

const handleStartStep = () => {
  additionalState.openEdit = true;
};

const handleCloseAddUserModal = () => {
  additionalState.openEdit = false;
};

const handleMessage = () => {
  emits('unmount-chapter');
};
</script>
