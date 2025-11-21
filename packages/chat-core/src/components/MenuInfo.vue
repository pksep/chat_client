<template>
  <aside
    :class="menuInfoClasses"
    v-if="props.open"
    :data-testid="`${props.dataTestid}-MenuInfo-Container`"
  >
    <header
      class="menu-info__header"
      :data-testid="`${props.dataTestid}-MenuInfo-Header`"
    >
      <h4 :data-testid="`${props.dataTestid}-MenuInfo-Title`">
        {{ props.contact?.nickname || 'Общий' }}
      </h4>
      <Button
        class="menu-info__close-button"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        @click="handleCloseMenu"
        :data-testid="`${props.dataTestid}-MenuInfo-CloseButton`"
      >
        <Icon
          :name="IconNameEnum.crossLarge"
          class="menu-info__close-icon"
          :data-testid="`${props.dataTestid}-MenuInfo-CloseIcon`"
        />
      </Button>
    </header>
    <Tabs
      :tab-count="2"
      :default-active-tab-id="props.activeTabId"
      class="menu-info__tabs"
      :data-testid="`${props.dataTestid}-MenuInfo-Tabs`"
    >
      <template #header1>
        <span
          class="menu-info__user-header"
          :data-testid="`${props.dataTestid}-MenuInfo-Tab1Header`"
        >
          Участники
          <div
            class="menu-info__user-count"
            :data-testid="`${props.dataTestid}-MenuInfo-UserCount`"
          >
            {{ state.contacts.length }}
          </div>
        </span>
      </template>
      <template #header2> Информация </template>
      <template #tab1>
        <ContactListInModal
          :contacts="state.contacts"
          @unmount-click-add-button="handleContactClick"
          :data-testid="`${props.dataTestid}-MenuInfo-ContactListInModal`"
        />
      </template>
      <template #tab2>
        <section
          class="menu-info__info-section"
          :data-testid="`${props.dataTestid}-MenuInfo-InfoSection`"
        >
          <slot name="information-menu">
            <InformationMenu
              :model-value="state.information"
              @update:model-value="handleUpdateInformation"
              :data-testid="`${props.dataTestid}-MenuInfo-InformationMenu`"
            />
          </slot>
        </section>
      </template>
    </Tabs>
  </aside>
  <NewContactModal
    :open="state.openAddUser"
    :isAddOne="false"
    :contacts="props.members"
    @unmount-new-contact="handleNewContact"
    @unmount-close="handleCloseAddUserModal"
    title="Добавить контакт"
  />
</template>

<script lang="ts" setup>
import { reactive, computed, watch } from 'vue';
import { useResizeState } from '../composables/useResizeState';
import {
  Tabs,
  Button,
  ButtonTypeEnum,
  IconNameEnum,
  SizesEnum,
  Icon
} from '@pksep/yui';
import ContactListInModal from './ContactList/ContactListInModal.vue';
import InformationMenu from './InformationMenu.vue';
import type {
  IMenuRightProps,
  IMenuEmits,
  IUserProps
} from './interfaces/interfaces';
import { MAX_W_XL } from '../utils/constants';
import { fetchGroupMembers } from '../services/useGroup';
import { IMSDK } from '../services/useOpenIM';
import NewContactModal from './NewChat/NewContactModal.vue';
import { generateChatId } from '../services/useMastra';

const props = withDefaults(defineProps<IMenuRightProps>(), {
  open: false,
  dataTestid: () => 'MenuInfo'
});

const emits = defineEmits<IMenuEmits>();

const state = reactive({
  openAddUser: false,
  contacts: [],
  information: null
});

const menuInfoClasses = computed(() => [
  'menu-info',
  { 'menu-info--open': props.open }
]);

const { state: isOpen, setState } = useResizeState({
  breakpoint: MAX_W_XL,
  onStateChange: (val: boolean) => emits('unmount-collapse', val)
});

const close = () => setState(false);

const handleCloseMenu = (): void => {
  close();
};

const handleContactClick = (): void => {
  state.openAddUser = true;
};

const handleNewContact = (contacts: IUserProps[]): void => {
  if (props.contact?.groupId) {
    state.contacts = [...state.contacts, ...contacts];
    IMSDK.inviteUserToGroup(
      {
        groupID: props.contact?.groupId,
        reason: 'Отправили приглашение',
        userIDList: contacts.map(contact => contact.id)
      },
      generateChatId()
    );
  }
};

const handleUpdateInformation = (value: any) => {
  state.information = value;
  IMSDK.setGroupInfo(
    {
      groupID: props.contact?.groupId,
      groupName: state.information?.name,
      faceURL: state.information?.avatarUrl,
      //`Поменяли название группы на ${state.information?.name}`
      notification: null
    },
    generateChatId()
  );
};

watch(
  () => props.contact,
  async () => {
    handleCloseMenu();
  }
);

watch(
  () => props.open,
  async newVal => {
    isOpen.value = newVal;
    if (
      props.contact?.id &&
      (props.contact?.groupId === undefined ||
        props.contact?.groupId === null ||
        props.contact?.groupId === '')
    ) {
      state.contacts = [props.contact];
      state.information = {
        id: props.contact?.id
      };
    } else {
      state.contacts = await fetchGroupMembers(props.contact?.groupId);
      state.information = {
        id: props.contact?.groupId
      };
    }

    if (props.contact) {
      state.information = {
        name: props.contact.nickname || '',
        avatarUrl: props.contact.avatarUrl,
        date: new Date().toLocaleDateString()
      };
    }
  }
);

const handleCloseAddUserModal = () => {
  state.openAddUser = false;
};
</script>
