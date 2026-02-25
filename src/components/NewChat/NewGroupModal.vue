<template>
  <Modal
    :open="props.open"
    class="new-group"
    position="center"
    @close="closeModal"
    :data-testid="`${props.dataTestid}-NewGroupModal-Container`"
  >
    <header class="new-group__header">
      {{ !isSelectedMembers ? 'Добавить участника' : 'Общий' }}
      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        @click="closeModal"
        class="new-group__button-close"
      >
        <Icon :name="IconNameEnum.crossSmall" />
      </Button>
    </header>
    <ContactSelector
      v-if="!isSelectedMembers"
      @unmount-contact="handleOpenGroupInfo"
      :selected-contact-ids="
        new Set(
          selectedContacts.filter(u => u.id !== authedUser.id).map(u => u.id)
        )
      "
    />

    <div v-else class="menu-info__modal-wrapper">
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
            :contacts="filteredSelectedContacts"
            :excluded-contact-ids="excludedContactIds"
            class="new-group__tab2-profile"
            @unmount-click-add-button="handleCloseGroupInfo"
            :filtered-contacts="
              selectedContacts.filter(u => u.id !== authedUser.id)
            "
          />
        </template>
        <template #tab2>
          <div class="menu-info__group-info new-group-info">
            <Avatar
              :url="`${config.CHAT_PATH_TO_FILE_CDN}/${avatarPreview}`"
              :alt="groupName"
              class="user-profile__avatar"
              :initials="groupName"
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
        :loading="isCreating"
        class="contact-selector__add"
        :disabled="isCreating || !groupName"
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
import { IUser } from '../interfaces/interfaces';
import { useNewGroupModal } from './composables/useNewGroupModal';
import { computed } from 'vue';
import { getUsersList } from '../../composables/useUsers';
import { getConfig } from '../../services/useConfig';
import { authedUser } from '../../composables/useAuth';

const props = withDefaults(defineProps<INewContactProps & { user?: IUser }>(), {
  open: false,
  dataTestid: 'NewGroupModal'
});

const emits = defineEmits<{
  (e: 'unmount-close'): void;
}>();

const contacts = computed(() => getUsersList());

const config = getConfig();

const {
  avatarInputRef,
  groupName,
  isSelectedMembers,
  selectedContacts,
  avatarPreview,
  isEditAvatar,
  file,
  isCreating,
  onAvatarSelected,
  onSaveAvatar,
  closeEditAvatar,
  closeModal,
  handleCreateGroup,
  handleOpenGroupInfo,
  handleCloseGroupInfo
} = useNewGroupModal(props, emits);

const filteredSelectedContacts = computed(() => {
  return selectedContacts.value.filter(
    contact =>
      contact &&
      'initials' in contact &&
      'nickname' in contact &&
      'lastOnline' in contact
  ) as IUser[];
});

const excludedContactIds = computed(() => {
  const ids = new Set<string | number>();
  if (filteredSelectedContacts.value) {
    filteredSelectedContacts.value.forEach(contact => {
      if (contact && contact.id) {
        ids.add(contact.id);
      }
    });
  }
  return ids;
});
</script>
