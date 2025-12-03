<template>
  <section
    :class="['menu__info-users', props.class]"
    :data-testid="`${props.dataTestid}-ContactListInModal-Container`"
  >
    <Button
      v-if="props.showAddButton"
      :type="ButtonTypeEnum.secondary"
      :class="[
        'button-menu__info menu__info-add-user',
        props.addButtonClass ?? ''
      ]"
      :size="SizesEnum.large"
      @click="addUser"
      :data-testid="`${props.dataTestid}-ContactListInModal-AddButton`"
    >
      <Icon :name="IconNameEnum.addUser" class="menu__info-add-user-icon" />
      Добавить участника
    </Button>
    <ul
      :class="['menu__info-users-list', props.listClass ?? '']"
      :data-testid="`${props.dataTestid}-ContactListInModal-List`"
    >
      <li
        v-for="(user, index) in props.contacts"
        :key="index"
        :data-testid="`${props.dataTestid}-ContactListInModal-Item${index + 1}`"
      >
        <template v-if="user">
          <UserProfile
            avatar-alt="avatar of user"
            :class="['menu__user-profile', props.userClass ?? '']"
            :avatar-url="user.avatarUrl"
            :tabel="user.tabel"
            :nickname="user.nickname"
            :dataTestid="`${props.dataTestid}-ContactListInModal-UserProfile${index + 1}`"
            @unmount-click="openActivePopover(user.id.toString(), $event)"
          />
          <ContextMenu
            :visible="isOpen[user.id.toString()]"
            :position="position"
            @unmount-close="closeActivePopover(user.id.toString())"
            :data-testid="`${props.dataTestid}-ContactListInModal-ContextMenu${index + 1}`"
          >
            <template #default>
              <Button
                class="menu__info-button-little"
                :type="ButtonTypeEnum.ghost"
                :size="SizesEnum.little"
                @click="closeActivePopover(user.id.toString())"
                :data-testid="`${props.dataTestid}-ContactListInModal-RemoveButton${index + 1}`"
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
    :dataTestid="`${props.dataTestid}-ContactListInModal-NewContactModal`"
    @unmount-close="closeContactModal"
  />
</template>

<script setup lang="ts">
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';
import UserProfile from '../UserProfile/UserProfile.vue';
import { ref } from 'vue';
import NewContactModal from '../NewChat/NewContactModal.vue';
import ContextMenu from '../ContactList/ContextMenu.vue';
import { useContextMenu } from '../../composables/useContextMenu';
import { IContactListProps } from './interfaces/contact-list';

const props = withDefaults(defineProps<IContactListProps>(), {
  showAddButton: true,
  contacts: () => [
    {
      id: '1',
      name: 'John Doe',
      nickname: 'jd',
      avatarUrl: '/avatar.jpg'
    }
  ],
  dataTestid: () => 'ContactListInModal'
});

const emits = defineEmits<{
  (e: 'unmount-click-add-button'): void;
}>();

const { isOpen, position, openActivePopover, closeActivePopover } =
  useContextMenu();

const newContactOpen = ref(false);

const addUser = (): void => {
  emits('unmount-click-add-button');
};

const closeContactModal = (): void => {
  newContactOpen.value = false;
};
</script>
