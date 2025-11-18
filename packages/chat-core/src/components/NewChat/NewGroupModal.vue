<template>
  <Modal
    :open="state.open"
    class="new-group"
    position="center"
    @close="closeModal"
  >
    <header class="new-group__header">
      {{ !state.isSelectedMembers ? 'Добавить участника' : 'Общий' }}
      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        @click="closeModal"
        class="new-group__button-close"
      >
        <Icon :name="IconNameEnum.crossLarge" />
      </Button>
    </header>
    <ContactSelector
      v-if="!state.isSelectedMembers"
      :contacts="contacts"
      :selected-contact-ids="state.checkUsers"
      @unmount-checkbox="handleCheckbox"
      @unmount-click="handleOpenGroupInfo"
    />

    <div v-else>
      <Tabs :tabCount="2">
        <template #header2>
          <span class="menu-info__user-header">
            Участники
            <div class="menu-info__user-count">{{ state.checkUsers.size }}</div>
          </span>
        </template>
        <template #header1> Информация </template>
        <template #tab2>
          <ContactListInModal
            :contacts="state.selectedContacts"
            @unmount-click-add-button="handleCloseGroupInfo"
          />
        </template>
        <template #tab1>
          <div class="menu-info__group-info">
            <Avatar
              :url="state.avatarPreview"
              :alt="state.groupName"
              class="user-profile__avatar"
              :initials="state.groupName"
              :style="{
                '--size-avatar': '86px',
                'min-width': '86px',
                'min-height': '86px'
              }"
              @click="() => avatarInputRef.click()"
            />

            <div>
              <h4>Название:</h4>
              <Input placeholder="Название:" class="minor" v-model="state.groupName" />
            </div>
          </div>

          <input
            v-show="false"
            ref="avatarInputRef"
            type="file"
            accept="image/*"
            @change="onAvatarSelected"
          />
        </template>
      </Tabs>

      <Button
        :type="ButtonTypeEnum.primary"
        :size="SizesEnum.little"
        class="contact-selector__add"
        :disabled="!state.groupName"
        @click="handleCreateGroup"
      >
        Создать
      </Button>
    </div>
  </Modal>
  <AddUser :open="state.openAddUser" @unmount-close="handleCloseAddUser" />
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  Icon,
  IconNameEnum,
  Modal,
  SizesEnum,
  ButtonTypeEnum,
  Button,
  Input,
  Avatar,
  Tabs
} from '@pksep/yui';
import ContactSelector from './ContactSelector.vue';
import AddUser from './AddUser.vue';
import type { INewContactProps } from './interfaces/new-contact';
import { createGroup } from '../../services/useGroup';
import ContactListInModal from '../ContactList/ContactListInModal.vue';
import { uploadFile } from '../../services/useOpenIM';

const props = withDefaults(defineProps<INewContactProps>(), {
  open: false,
  contacts: () => []
});

const emits = defineEmits<{
  (e: 'unmount-close'): void;
  (e: 'unmount-new-group');
}>();

const avatarInputRef = ref(null);

const state = reactive({
  open: false,
  checkUsers: new Set<string>(),
  selectedContacts: computed(() =>
    props.contacts.filter(c => state.checkUsers.has(c.id))
  ),
  openAddUser: false,
  groupName: '',
  isSelectedMembers: false,
  avatarPreview: ''
});

watch(
  () => props.open,
  () => {
    state.open = props.open;
  }
);

watch(
  () => state.openAddUser,
  () => {
    state.open = !state.openAddUser;
  }
);

const onAvatarSelected = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const url = await uploadFile(file);
  state.avatarPreview = url;
};

const closeModal = (): void => {
  state.open = false;
  state.openAddUser = false;
  emits('unmount-close');
};

const handleCheckbox = (isCheck: boolean, contactId: string): void => {
  if (isCheck) {
    state.checkUsers.add(contactId);
  } else {
    state.checkUsers.delete(contactId);
  }
};

const handleCloseAddUser = (): void => {
  state.openAddUser = false;
};

const handleCreateGroup = async (): Promise<void> => {
  await createGroup(
    Array.from(state.checkUsers),
    state.groupName,
    state.avatarPreview
  );
  emits('unmount-new-group');
  closeModal();
};

const handleOpenGroupInfo = async (): Promise<void> => {
  state.isSelectedMembers = true;
  if (!state.groupName) {
    state.groupName = state.selectedContacts.map(c => c.nickname).join(', ');
  }
};

const handleCloseGroupInfo = async (): Promise<void> => {
  state.isSelectedMembers = false;
};
</script>
