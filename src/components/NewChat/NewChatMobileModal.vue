<template>
  <MobileModal
    :class="props.isAddOne ? 'modal__new-contact' : 'modal__new-group'"
    :open="props.open && !isSelectedMembers"
    @unmount-close="handleCloseModal"
    @unmount-next="handleNext(state.checkMembers)"
    :title="props.isAddOne ? 'Написать сообщение' : 'Добавить участников'"
    :start-button-text="null"
    :close-button-text="'Назад'"
    :is-disabled-start-button="state.checkMembers.length === 0"
    :data-testid="`${props.dataTestid}-NewChatMobileModal-Container`"
  >
    <template v-if="!props.isAddOne" #header>
      <button
        class="mobile__modal-header--button"
        :data-testid="`${props.dataTestid}-MobileModal-CloseButton`"
        @click="handleCloseModal"
      >
        Назад
      </button>
      <h3 class="mobile__modal-header--title new-group-mobile__title">
        Добавить участников
        <span v-if="state.checkMembers.length" class="new-group-mobile__count">
          {{ state.checkMembers.length }}
        </span>
      </h3>
      <span aria-hidden="true" />
    </template>
    <template #default>
      <ContactSelector
        class="mobile__list-modal__contact-selector"
        :is-add-one="props.isAddOne"
        is-button-disabled
        :selected-contact-ids="selectedContactIds"
        :excluded-contact-ids="props.excludedContactIds"
        @unmount-contact="handleCheckUsers"
        @unmount-close="handleCloseModal"
      />
    </template>
    <template v-if="!props.isAddOne" #footer>
      <div class="new-group-mobile-info__footer">
        <Button
          :type="ButtonTypeEnum.primary"
          :size="SizesEnum.medium"
          class="new-group-mobile-info__create-button"
          :disabled="state.checkMembers.length === 0"
          @click="handleNext(state.checkMembers)"
        >
          Далее
        </Button>
      </div>
    </template>
  </MobileModal>
  <MobileModal
    :open="props.open && isSelectedMembers"
    @unmount-close="handleCloseGroupInfo"
    title="Группа"
    class="modal__new-group new-group-mobile-info"
    @unmount-next="handleCreateMobileGroup"
    :start-button-text="null"
    :is-disabled-start-button="isCreating || !form.name?.trim()"
    close-button-text="Назад"
    :data-testid="`${props.dataTestid}-NewChatMobileModal-GroupModal`"
  >
    <MobileChatInfo
      creating
      :show-add-button="false"
      :model-value="form"
      :members="filteredSelectedContacts"
      :data-testid="`${props.dataTestid}-NewChatMobileModal-MobileChatInfo`"
      @unmount-added-users="handleAddUsers"
    />
    <template #footer>
      <div class="new-group-mobile-info__footer">
        <p v-if="creationError" class="new-group__mobile-error" role="alert">
          {{ creationError }}
        </p>
        <Button
          :type="ButtonTypeEnum.primary"
          :size="SizesEnum.medium"
          class="new-group-mobile-info__create-button"
          :disabled="isCreating || !form.name?.trim()"
          :aria-busy="isCreating"
          @click="handleCreateMobileGroup"
        >
          Создать
        </Button>
      </div>
    </template>
  </MobileModal>
</template>

<script setup lang="ts">
import { reactive, computed, watch } from 'vue';
import { Button, ButtonTypeEnum, SizesEnum } from '@pksep/yui';
import MobileModal from '../UI/MobileModal.vue';
import ContactSelector from './ContactSelector.vue';
import MobileChatInfo from '../Header/MobileChatInfo.vue';
import {
  INewChatMobileProps,
  INewChatMobileEmits
} from './interfaces/contact-selector';
import { useNewGroupModal } from './composables/useNewGroupModal';
import { IUser } from '../interfaces/interfaces';
import { getChatSDK } from '../../services/useChat';
import { navigateToDialogs } from '../../composables/navigation';
import { useNewInformationModal } from '../../composables/useNewInformationModal';

const props = withDefaults(defineProps<INewChatMobileProps>(), {
  open: false,
  dataTestid: () => 'NewChatMobileModal'
});

const emits = defineEmits<INewChatMobileEmits>();

const {
  groupName,
  selectedContacts,
  isSelectedMembers,
  avatarPreview,
  isCreating,
  creationError,
  handleCreateGroup,
  createNiceName,
  closeModal,
  handleOpenGroupInfo,
  handleCloseGroupInfo
} = useNewGroupModal(props, emits);

const filteredSelectedContacts = computed<IUser[]>(() => {
  return selectedContacts.value.filter(
    contact =>
      contact &&
      typeof contact === 'object' &&
      'initials' in contact &&
      'nickname' in contact &&
      'lastOnline' in contact
  ) as IUser[];
});

const state = reactive({
  checkMembers: [] as IUser[]
});

const selectedContactIds = computed(
  () => new Set(state.checkMembers.map(user => user.id))
);

const { form, handleUpdateInformation } = useNewInformationModal({
  name: '',
  avatarUrl: ''
});

const handleCloseModal = () => {
  state.checkMembers = [];
  closeModal();
};

const handleCheckUsers = async (contacts: IUser[] | IUser): Promise<void> => {
  const sdk = getChatSDK();
  if (props.isAddOne && 'id' in contacts && contacts.id) {
    const topic = await sdk.createTopic({ peerId: contacts.id });
    navigateToDialogs(topic.id as string);
    return;
  } else {
    if (Array.isArray(contacts)) {
      state.checkMembers = contacts;
    }
  }
};

const handleNext = (contacts: IUser[]): void => {
  if (props.isAddOne) return;
  const name = form.name || createNiceName(contacts);
  handleUpdateInformation({ avatarUrl: form.avatarUrl, name });
  handleOpenGroupInfo(contacts);
};

const handleCreateInformation = ({ avatarUrl, name }) => {
  avatarPreview.value = avatarUrl;
  groupName.value = name;
};

const handleCreateMobileGroup = async () => {
  handleCreateInformation(form);
  await handleCreateGroup();
};

const handleAddUsers = (addedUsers: IUser[]) => {
  state.checkMembers = [
    ...filteredSelectedContacts.value.slice(1),
    ...addedUsers
  ];
  handleOpenGroupInfo(state.checkMembers);
};

watch(
  () => props.open,
  open => {
    if (!open) {
      state.checkMembers = [];
      handleUpdateInformation({ name: '', avatarUrl: '' });
    }
  }
);
</script>
