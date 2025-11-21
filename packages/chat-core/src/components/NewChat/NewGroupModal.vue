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
      @unmount-contact="handleOpenGroupInfo"
    />

    <div v-else>
      <Tabs :tabCount="2" :defaultActiveTabId="2">
        <template #header1>
          <span class="menu-info__user-header">
            Участники
            <div class="menu-info__user-count">
              {{ state.selectedContacts.length }}
            </div>
          </span>
        </template>
        <template #header2> Информация </template>
        <template #tab1>
          <ContactListInModal
            :contacts="state.selectedContacts"
            @unmount-click-add-button="handleCloseGroupInfo"
          />
        </template>
        <template #tab2>
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
              <Input
                placeholder="Название:"
                class="minor"
                v-model="state.groupName"
              />
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
import type { INewContactProps } from './interfaces/new-contact';
import { createGroup } from '../../services/useGroup';
import ContactListInModal from '../ContactList/ContactListInModal.vue';
import { uploadFile } from '../../services/useOpenIM';
import { IUserProps } from '../interfaces/interfaces';

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
  checkUsers: [],
  selectedContacts: computed(() => [
    props.user,
    ...props.contacts.filter(c => new Set(state.checkUsers).has(c.id))
  ]),
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

const handleCreateGroup = async (): Promise<void> => {
  await createGroup(state.checkUsers, state.groupName, state.avatarPreview);
  emits('unmount-new-group');
  closeModal();
};

const handleOpenGroupInfo = async (contacts: IUserProps[]): Promise<void> => {
  state.isSelectedMembers = true;
  state.checkUsers = contacts.map(contact => contact.id);
  if (!state.groupName) {
    state.groupName = state.selectedContacts.map(c => c.nickname).join(', ');
  }
};

const handleCloseGroupInfo = async (): Promise<void> => {
  state.isSelectedMembers = false;
};
</script>
