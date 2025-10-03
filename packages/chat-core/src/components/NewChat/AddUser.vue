<template>
  <Modal :open position="center" class="add-user">
    <MenuInfo>
      <template #information-menu>
        <Avatar is-icon />
        <NewChatInformationForm />
      </template>
    </MenuInfo>
  </Modal>
</template>

<script lang="ts" setup>
import { Avatar, Modal } from 'sep-yui';
import MenuInfo from '../MenuInfo.vue';
import NewChatInformationForm from './NewChatInformationForm.vue';

defineProps<{ open: boolean }>();
</script>

<style scoped>
.add-user {
  width: 370px;
}
</style>
