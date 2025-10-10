<template>
  <section class="menu__info-users">
    <article>
      <Button
        :type="ButtonTypeEnum.secondary"
        class="button-menu__info menu__info-add-user"
        :size="SizesEnum.large"
        @click="addUser"
      >
        <Icon :name="IconNameEnum.addUser" class="menu__info-add-user-icon" />
        Добавить участника
      </Button>
      <ul class="menu__info-users-list">
        <li><UserProfile @unmount-click="openActivePopover" /></li>
      </ul>
      <ContextMenu
        :visible="isOpen"
        :position="position"
        @unmount-close="closeActivePopover"
      >
        <template #default>
          <Button
            :type="ButtonTypeEnum.ghost"
            :size="SizesEnum.little"
            @click="closeActivePopover"
          >
            Удалить из канала
          </Button>
        </template>
      </ContextMenu>
    </article>
  </section>
  <Teleport to="body">
    <NewContactModal
      :open="newContactOpen"
      @unmount-close="closeContactModal"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { Button, ButtonTypeEnum, Icon, IconNameEnum, SizesEnum } from 'sep-yui';
import UserProfile from '../UserProfile/UserProfile.vue';
import { ref } from 'vue';
import NewContactModal from '../NewChat/NewContact.vue';
import ContextMenu from '../ContactList/ContextMenu.vue';
import { useContextMenu } from '../../composables/useContextMenu';

const { isOpen, position, openActivePopover, closeActivePopover } =
  useContextMenu();

const newContactOpen = ref(false);
const addUser = () => {
  newContactOpen.value = true;
};
const closeContactModal = () => {
  newContactOpen.value = false;
};
</script>

<style lang="css" scoped>
@import url('../../assets/menu-info-users.css');

.menu__info-add-user {
  display: grid;
  place-content: center;
}

div.buttons-menu__info,
button.button-yui-kit.menu__info-add-user.large {
  --icon-color: var(--blue1);
  width: 100%;
}

section.menu__info-users {
  padding: 10px;
  & article {
    padding-inline: 10px;
  }
}

.menu__info-users-list {
  display: grid;
  margin-top: 10px;
  gap: 8px;
}
</style>
