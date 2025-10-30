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
        <li>
          <UserProfile
            avatar-url="/avatar-user.png"
            avatar-alt="avatar of user"
            name="Zakk Wylde"
            class="menu__user-profile"
            nickname="@wyldetheguy"
            @unmount-click="openActivePopover"
          />
        </li>
      </ul>
      <ContextMenu
        :visible="isOpen"
        :position="position"
        @unmount-close="closeActivePopover"
      >
        <template #default>
          <Button
            class="menu__info-button-little"
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
  <NewContactModal :open="newContactOpen" @unmount-close="closeContactModal" />
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

const addUser = (): void => {
  newContactOpen.value = true;
};

const closeContactModal = (): void => {
  newContactOpen.value = false;
};
</script>
