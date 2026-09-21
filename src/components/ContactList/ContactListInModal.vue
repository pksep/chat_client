<template>
  <section
    :class="['menu__info-users', $attrs.class]"
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
    <slot name="after-add-button" />
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
            :class="[
              'menu__user-profile',
              {
                'user-profile--interactive': canOpenUserInfo(user)
              },
              props.userClass ?? ''
            ]"
            :user="user"
            :dataTestid="`${props.dataTestid}-ContactListInModal-UserProfile${index + 1}`"
            @click.stop="openUserInfo(user)"
            @unmount-click="
              user.id !== authUser.id &&
                openActivePopover(user.id.toString(), $event)
            "
          />
          <ContextMenu
            v-if="currentGroup?.isAdmin"
            :visible="isOpen[user.id.toString()]"
            :position="position"
            @unmount-close="closeActivePopover(user.id.toString())"
            :data-testid="`${props.dataTestid}-ContactListInModal-ContextMenu${index + 1}`"
          >
            <template #default>
              <Button
                class="menu__info-button-little error-dark-color"
                :type="ButtonTypeEnum.popover"
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

  <MobileModal
    v-if="isMobile"
    :open="newContactOpen"
    @unmount-close="closeContactModal"
    @unmount-next="handleAddMembers"
    title="Добавить участников"
    close-button-text="Назад"
    start-button-text="Добавить"
    :data-testid="`${props.dataTestid}-NewChatMobileModal-Container`"
  >
    <template #default>
      <ContactSelector
        class="mobile__list-modal__contact-selector"
        :excluded-contact-ids="excludedContactIds"
        @unmount-select-contact="handleNewContact"
        :selected-contact-ids="
          new Set(props.filteredContacts.map(user => user.id))
        "
        is-button-disabled
      />
    </template>
  </MobileModal>
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
import ContextMenu from '../ContactList/ContextMenu.vue';
import { useContextMenu } from '../../composables/useContextMenu';
import { currentGroup, useGroup } from '../../composables/useGroup';
import type { IUser } from '../interfaces/interfaces';
import MobileModal from '../UI/MobileModal.vue';
import ContactSelector from '../NewChat/ContactSelector.vue';
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';
import { useUrlWatcher } from '../../composables/navigation';
import { getAuthUser } from '../../composables/useAuth';
import { useUserInfoModal } from '../../composables/useUserInfoModal';

interface ContactListInModalProps {
  showAddButton?: boolean;
  contacts?: IUser[];
  filteredContacts?: IUser[];
  dataTestid?: string;
  class?: string;
  addButtonClass?: string;
  listClass?: string;
  userClass?: string;
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
  (e: 'unmount-added-users', selectedUsers: IUser[]): void;
}>();

const route = useUrlWatcher();
const { openUserInfo, canOpenUserInfo } = useUserInfoModal();

const authUser = computed(() => getAuthUser());

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

const { addGroupMembers } = useGroup();

const newContactOpen = ref(false);

const selectedUsers = ref<IUser[]>([]);

const { state: isMobile } = useResizeState(MAX_W_MD);

const addUser = (): void => {
  openContactModal();
  emits('unmount-click-add-button');
};

const deleteUserFromChat = (userId: string) => {
  removeUserFromGroup(currentGroup.value.group.id, userId);
  closeActivePopover(userId);
};

const handleNewContact = (users: IUser[]) => {
  selectedUsers.value = users;
};

const handleAddMembers = async (): Promise<void> => {
  if (route.value.id) {
    await addGroupMembers(currentGroup.value.group.id, selectedUsers.value);
  } else {
    emits('unmount-added-users', selectedUsers.value);
  }
  closeContactModal();
};

const openContactModal = (): void => {
  newContactOpen.value = true;
};

const closeContactModal = (): void => {
  newContactOpen.value = false;
};
</script>
