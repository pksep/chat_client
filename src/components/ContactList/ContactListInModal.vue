<template>
  <section
    :class="['menu__info-users', props.class]"
    :data-testid="`${props.dataTestid}-Container`"
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
      :data-testid="`${props.dataTestid}-AddButton`"
    >
      <Icon :name="IconNameEnum.addUser" class="menu__info-add-user-icon" />
      Добавить участника
    </Button>
    <ul
      :class="['menu__info-users-list', props.listClass ?? '']"
      :data-testid="`${props.dataTestid}-ContactListInModal-List`"
    >
      <li
        v-for="(user, index) in reactiveContacts"
        :key="user.id"
        class="menu__info-user-list--item"
        :data-testid="`${props.dataTestid}-ContactListInModal-Item${index + 1}`"
      >
        <template v-if="user">
          <UserProfile
            :class="['menu__user-profile', props.userClass ?? '']"
            :user="user"
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
                @click="deleteUserFromChat(user.id.toString())"
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
    :contacts="props.filteredContacts"
    :excluded-contact-ids="excludedContactIds"
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
import { ref, computed } from 'vue';
import NewContactModal from '../NewChat/NewContactModal.vue';
import ContextMenu from '../ContactList/ContextMenu.vue';
import { useContextMenu } from '../../composables/useContextMenu';
import { useGroup } from '../../composables/useGroup';
import type { IUser } from '../interfaces/interfaces';

interface ContactListInModalProps {
  showAddButton?: boolean;
  contacts?: IUser[];
  filteredContacts?: IUser[];
  dataTestid?: string;
  class?: string;
  addButtonClass?: string;
  listClass?: string;
  userClass?: string;
  groupId?: string;
  excludedContactIds?: Set<string | number>;
}

const { removeUserFromGroup } = useGroup();

const props = withDefaults(defineProps<ContactListInModalProps>(), {
  showAddButton: true,
  contacts: () => [
    {
      id: '1',
      initials: 'JD',
      nickname: 'jd',
      avatarUrl: '/avatar.jpg',
      lastOnline: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    }
  ],
  filteredContacts: () => [],
  excludedContactIds: () => new Set<string | number>(),
  dataTestid: () => 'ContactListInModal'
});

const emits = defineEmits<{
  (e: 'unmount-click-add-button'): void;
}>();

const reactiveContacts = computed(() => {
  const contacts = props.contacts || [];
  return [...contacts];
});

const excludedContactIds = computed(() => {
  const ids = new Set<string | number>();
  if (props.contacts) {
    props.contacts.forEach(contact => {
      if (contact && contact.id) {
        ids.add(contact.id);
      }
    });
  }
  return ids;
});

const { isOpen, position, openActivePopover, closeActivePopover } =
  useContextMenu();

const newContactOpen = ref(false);

const addUser = (): void => {
  emits('unmount-click-add-button');
};

const deleteUserFromChat = (userId: string) => {
  removeUserFromGroup(props.groupId, userId);
  closeActivePopover(userId);
};

const closeContactModal = (): void => {
  newContactOpen.value = false;
};
</script>
