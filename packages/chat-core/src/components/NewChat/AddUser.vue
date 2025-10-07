<template>
  <Modal :open position="center" class="add-user">
    <MenuInfo :open @unmount-collapse="closeModal">
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
import { Button, Avatar, ButtonTypeEnum, Modal, SizesEnum } from 'sep-yui';
import MenuInfo from '../MenuInfo.vue';
import NewChatInformationForm from './NewChatInformationForm.vue';

defineProps<{ open: boolean }>();

const emits = defineEmits<{
  (e: 'unmount-close'): void;
}>();

const closeModal = (): void => {
  emits('unmount-close');
};
</script>

<style scoped>
.add-user {
  width: 370px;
  height: 555px;
}

.add-user__button {
  display: flex;
  justify-content: flex-end;
  padding-right: 20px;
  padding-bottom: 10px;
  width: 100%;
  margin-right: 0;
}

.add-user__avatar {
  grid-area: avatar;
}

:deep(.form__textarea) {
  grid-area: description;
}

:deep(.menu__info-form) {
  align-items: start;
  grid-template-areas:
    'avatar name'
    'description description';
}

:deep(.form__name) {
  grid-area: name;
}

:deep(.tabs__navigation-content) {
  height: 437px;
}
</style>
