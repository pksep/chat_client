<template>
  <GeneralizedModal
    :open="props.open"
    position="bottom"
    @close="handleCloseModal"
    modal-class="mobile__list-modal"
    header-class="mobile__list-modal__header"
    close-button-class="mobile__list-modal__header--button"
  >
    <template #header>
      <button
        class="mobile__list-modal__header--button"
        @click="handleCloseModal"
      >
        Отмена
      </button>
      <h3 class="mobile__list-modal__header--title">Написать сообщение</h3>
    </template>

    <template #default>
      <ContactSelector
        class="mobile__list-modal__contact-selector"
        is-add-one
        :contacts="props.contacts"
        :selected-contact-ids="props.selectedContactIds"
        @unmount-contact="contact => emits('unmount-contact', contact)"
        @unmount-checkbox="
          (isCheck, contactId) => emits('unmount-checkbox', isCheck, contactId)
        "
        @unmount-click="handleOpenUser"
      />
    </template>
  </GeneralizedModal>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import GeneralizedModal from '../GeneralizedModal.vue';
import ContactSelector from './ContactSelector.vue';
import type { IUserProps } from '../interfaces/interfaces';

interface IProps {
  open: boolean;
  contacts: IUserProps[];
  selectedContactIds: Set<string | number>;
}

interface IEmits {
  'close-modal': [];
  'unmount-contact': [contact: IUserProps];
  'unmount-checkbox': [isCheck: boolean, contactId: string | number];
  'unmount-click': [];
}

const props = withDefaults(defineProps<IProps>(), {
  open: false,
  contacts: () => [],
  selectedContactIds: () => new Set<string | number>()
});

const emits = defineEmits<IEmits>();

const isButtonDisabled = computed(() => props.selectedContactIds.size === 0);

const handleCloseModal = () => {
  emits('close-modal');
};

const handleOpenUser = () => {
  if (isButtonDisabled.value) return;
  emits('unmount-click');
};
</script>
