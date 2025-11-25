<template>
  <Modal
    :open="props.open"
    class="new-group"
    position="center"
    @close="closeModal"
  >
    <header class="new-group__header">
      {{ !isSelectedMembers ? 'Добавить участника' : 'Общий' }}
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
      v-if="!isSelectedMembers"
      :contacts="contacts"
      @unmount-contact="handleOpenGroupInfo"
    />

    <div v-else>
      <Tabs :tabCount="2" :defaultActiveTabId="2">
        <template #header1>
          <span class="menu-info__user-header">
            Участники
            <div class="menu-info__user-count">
              {{ selectedContacts.length }}
            </div>
          </span>
        </template>
        <template #header2> Информация </template>
        <template #tab1>
          <ContactListInModal
            :contacts="selectedContacts"
            @unmount-click-add-button="handleCloseGroupInfo"
          />
        </template>
        <template #tab2>
          <div class="menu-info__group-info">
            <Avatar
              :url="avatarPreview"
              :alt="groupName"
              class="user-profile__avatar"
              :initials="groupName"
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
                v-model="groupName"
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
          <ModalCroppedAvatar
            :image="file"
            :open="isEditAvatar"
            @unmount-close="closeEditAvatar"
            @unmount-save="onSaveAvatar"
          />
        </template>
      </Tabs>

      <Button
        :type="ButtonTypeEnum.primary"
        :size="SizesEnum.little"
        class="contact-selector__add"
        :disabled="!groupName"
        @click="handleCreateGroup"
      >
        Создать
      </Button>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import {
  ModalCroppedAvatar,
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
import ContactListInModal from '../ContactList/ContactListInModal.vue';
import { IUserProps } from '../interfaces/interfaces';
import { useNewGroupModal } from './composables/useNewGroupModal';

const props = withDefaults(
  defineProps<INewContactProps & { user?: IUserProps }>(),
  {
    open: false,
    contacts: () => []
  }
);

const emits = defineEmits<{
  (e: 'unmount-close'): void;
  (e: 'unmount-new-group', group: any): void;
}>();

const {
  avatarInputRef,
  groupName,
  isSelectedMembers,
  selectedContacts,
  avatarPreview,
  isEditAvatar,
  file,
  onAvatarSelected,
  onSaveAvatar,
  closeEditAvatar,
  closeModal,
  handleCreateGroup,
  handleOpenGroupInfo,
  handleCloseGroupInfo
} = useNewGroupModal(props, emits);
</script>
