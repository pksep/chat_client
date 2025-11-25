<template>
  <MobileModal
    :open="props.open"
    @unmount-close="handleCloseModal"
    @unmount-next="handleOpenGroupInfo(selectedContacts)"
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
        @unmount-contact="handleCheckUsers"
        @unmount-close="handleCloseModal"
      />
    </template>
  </MobileModal>
  <MobileModal
    :open="isSelectedMembers"
    @close="handleCloseGroupInfo"
    title="Канал"
    @unmount-next="handleCreateGroup"
    start-button-text="Создать"
    back-button-text="Отмена"
  >
    <MobileChatInfo
      v-model="additionalState.information"
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
  handleOpenGroupInfo,
  handleCloseGroupInfo
} = useNewGroupModal(props, emits);

const additionalState = reactive({
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

const handleCheckUsers = () => {
  // checkUsers(selectedContacts.value);
  // const group = await handleCreateGroup();
  // additionalState.information.groupId = group.groupID;
  // additionalState.information.name = group.showName;
};
</script>
