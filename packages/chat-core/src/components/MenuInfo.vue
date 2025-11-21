<template>
  <aside :class="menuInfoClasses" v-if="props.open">
    <header class="menu-info__header">
      <h4>{{ props.contact?.nickname || 'Общий' }}</h4>
      <Button
        class="menu-info__close-button"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        @click="handleCloseMenu"
      >
        <Icon :name="IconNameEnum.crossLarge" class="menu-info__close-icon" />
      </Button>
    </header>
    <Tabs
      :tab-count="2"
      :default-active-tab-id="props.activeTabId"
      class="menu-info__tabs"
    >
      <template #header1>
        <span class="menu-info__user-header">
          Участники
          <div class="menu-info__user-count">{{ state.contacts.length }}</div>
        </span>
      </template>
      <template #header2> Информация </template>
      <template #tab1>
        <ContactListInModal
          :contacts="state.contacts"
          @unmount-click-add-button="handleContactClick"
        />
      </template>
      <template #tab2>
        <section class="menu-info__info-section">
          <slot name="information-menu">
            <InformationMenu
              :model-value="state.information"
              @update:model-value="handleUpdateInformation"
            />
          </slot>
        </section>
      </template>
    </Tabs>
  </aside>
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
import type { IMenuRightProps, IMenuEmits } from './interfaces/interfaces';
import { MAX_W_XL } from '../utils/constants';
import { fetchGroupMembers } from '../services/useGroup';
import { IMSDK } from '../services/useOpenIM';

const props = withDefaults(defineProps<IMenuRightProps>(), {
  open: false
});

const emits = defineEmits<IMenuEmits>();

const state = reactive({
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
  emits('unmount-new-contact', { isChapterOpen: true });
};

const handleUpdateInformation = (value: any) => {
  state.information = value;
  IMSDK.setGroupInfo({
    groupID: props.contact?.groupId,
    groupName: state.information?.name,
    faceURL: props.contact.avatarUrl,
    notification: `Поменяли название группы на ${props.contact?.groupId}`
  });
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
</script>
