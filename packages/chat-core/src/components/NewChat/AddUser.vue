<template>
  <Modal
    :open="props.open"
    position="center"
    class="add-user"
    @close="closeModal"
  >
    <MenuInfo
      :open="props.open"
      @unmount-collapse="closeModal"
      @unmount-new-contact="unmountNewContact"
    >
      <template #information-menu>
        <NewChatInformationForm>
          <Avatar is-icon class="add-user__avatar" />
          <template #button>{{}}</template>
        </NewChatInformationForm>
      </template>
    </MenuInfo>
    <div class="add-user__button">
      <Button :type="ButtonTypeEnum.primary" :size="SizesEnum.little">
        Создать
      </Button>
    </div>
  </Modal>
</template>

<script lang="ts" setup>
import { Button, Avatar, ButtonTypeEnum, Modal, SizesEnum } from '@pksep/yui';
import MenuInfo from '../MenuInfo.vue';
import NewChatInformationForm from './NewChatInformationForm.vue';

const props = defineProps<{ open: boolean }>();

const emits = defineEmits<{
  (e: 'unmount-close'): void;
  (e: 'unmount-new-contact'): void;
}>();

const closeModal = (): void => {
  emits('unmount-close');
};

const unmountNewContact = (): void => {
  emits('unmount-new-contact');
};
</script>
