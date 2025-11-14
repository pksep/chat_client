<template>
  <section class="menu__info-users">
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
      <li v-for="(user, index) in props.contacts" :key="index">
        <template v-if="user">
          <UserProfile
            avatar-alt="avatar of user"
            class="menu__user-profile"
            :avatar-url="user.avatarUrl"
            :name="user.name"
            :nickname="user.nickname"
            @unmount-click="openActivePopover(user.id.toString(), $event)"
          />
          <ContextMenu
            :visible="isOpen[user.id.toString()]"
            :position="position"
            @unmount-close="closeActivePopover(user.id.toString())"
          >
            <template #default>
              <Button
                class="menu__info-button-little"
                :type="ButtonTypeEnum.ghost"
                :size="SizesEnum.little"
                @click="closeActivePopover(user.id.toString())"
              >
                Удалить из канала
              </Button>
            </template>
          </ContextMenu>
        </template>
      </li>
    </ul>
  </section>
  <NewContactModal
    :contacts="props.contacts"
    :open="newContactOpen"
    @unmount-close="closeContactModal"
  />
</template>

<script setup lang="ts">
import { Button, ButtonTypeEnum, Icon, IconNameEnum, SizesEnum } from 'sep-yui';
import UserProfile from '../UserProfile/UserProfile.vue';
import { ref } from 'vue';
import NewContactModal from '../NewChat/NewContact.vue';
import ContextMenu from '../ContactList/ContextMenu.vue';
import { useContextMenu } from '../../composables/useContextMenu';
import { IContactListProps } from './interfaces/contact-list';

const props = withDefaults(defineProps<IContactListProps>(), {
  contacts: () => [
    {
      id: '1',
      name: 'John Doe',
      nickname: 'jd',
      avatarUrl: '/avatar.jpg'
    }
  ]
});

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
