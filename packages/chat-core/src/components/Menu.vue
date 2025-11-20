<template>
  <aside :class="menuClasses">
    <div class="menu__start">
      <div class="menu__profile">
        <UserProfile
          v-bind="props.user"
          class="menu__user-profile"
          v-show="!isCollapse"
        />
        <Avatar
          v-if="isCollapse"
          :initials="props.user?.nickname"
          :url="props.user?.avatarUrl"
          :alt="props.user?.avatarAlt"
          is-icon
        />
        <Button
          :size="SizesEnum.small"
          :type="ButtonTypeEnum.ghost"
          class="menu__user-profile-collapse"
          @click="handleCollapse"
        >
          <Icon
            :name="IconNameEnum.sidebar"
            class="menu__user-profile-collapse-icon"
          />
        </Button>
      </div>
      <Line class="menu__user-line" />
      <div :class="aiChapterClasses" @click="unmountContactClick('ai')">
        <AiIconWrapper />
        <h3 class="menu__user-assistant-title" v-if="!isCollapse">
          AI Ассистент
        </h3>
      </div>
      <template v-for="(item, index) in listChannels" :key="index">
        <Line v-if="isCollapse" />
        <details class="menu__user-details" v-if="!isCollapse" open>
          <summary class="menu__user-details-summary">
            <h4>{{ item.title }}</h4>
            <Button
              :type="ButtonTypeEnum.ghost"
              :size="SizesEnum.little"
              @click="item.onClickPlusButton"
            >
              <Icon :name="IconNameEnum.plus" />
            </Button>
          </summary>
          <ContactList
            :contacts="item.items"
            @unmount-contact="unmountContactClick"
            :selected-contact-id="state.selectedContactId"
          />
        </details>
        <template v-if="isCollapse">
          <template v-for="(user, index) in state.contactList" :key="index">
            <ul class="menu__user">
              <li class="menu__user-avatar">
                <Avatar :url="user.avatarUrl" :initials="user.nickname" />
              </li>
            </ul>
            <Line />
          </template>
        </template>
      </template>
    </div>
    <Button
      v-if="state.installPrompt"
      class="menu__button-install-prompt"
      :type="ButtonTypeEnum.ghost"
      :size="SizesEnum.small"
      @click="pwaInstall"
    >
      <Icon :name="IconNameEnum.uploadCloud" />
      <template v-if="!isCollapse"> Загрузить на устройство </template>
    </Button>
  </aside>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive } from 'vue';
import { useResizeState } from '../composables/useResizeState';
import { MAX_W_XL } from '../utils/constants';
import Line from './UI/Line.vue';
import AiIconWrapper from './UI/AiIconWrapper.vue';
import {
  Icon,
  Button,
  Avatar,
  ButtonTypeEnum,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';
import UserProfile from './UserProfile/UserProfile.vue';
import ContactList from './ContactList/ContactList.vue';
import type {
  IContactProps,
  IMenuEmits,
  IUserProps
} from './interfaces/interfaces';
import {
  fetchConversationList,
  getConversationList
} from '../services/useConversions';
import { getGroupList } from '../services/useGroup';

const props = withDefaults(defineProps<{ user: IUserProps }>(), {});

const state = reactive({
  chapter: '',
  installPrompt: null,
  contactList: computed(() => getConversationList()),
  groupList: computed(() => getGroupList()),
  selectedContactId: null
});

const emits = defineEmits<IMenuEmits>();

const { state: isCollapse, toggle } = useResizeState({
  breakpoint: MAX_W_XL,
  onStateChange: val => {
    emits('unmount-collapse', val);
  }
});

const handleCollapse = (): void => {
  toggle();
};

const unmountContactClick = (contact: IContactProps | string): void => {
  state.selectedContactId = typeof contact === 'string' ? contact : contact.id;
  if (contact === 'ai') {
    state.chapter = 'ai';
    emits('unmount-chapter', 'ai');
    return;
  }

  if (typeof contact === 'string') {
    const foundContact = state.contactList.find(c => c.id === contact);
    if (foundContact) {
      state.chapter = foundContact.nickname;

      emits('unmount-chapter', {
        nickname: foundContact.nickname,
        contact: foundContact
      });
    }
  } else {
    state.chapter = contact.nickname;
    emits('unmount-chapter', {
      nickname: contact.nickname,
      contact: {
        ...contact,
        id: contact.userId,
        conversionId: contact.id || ''
      }
    });
  }
};

const menuClasses = computed(() => [
  'menu',
  { 'menu--collapse': isCollapse.value }
]);

const aiChapterClasses = computed(() => [
  'menu__user-assistant',
  {
    'menu__user-assistant--active': state.chapter === 'ai'
  }
]);

const handleNewGroupModal = () => {
  emits('unmount-new-group', { isChapterOpen: true });
};

const handleNewContactModal = () => {
  emits('unmount-new-contact', { isChapterOpen: true });
};

const listChannels = computed(() => [
  {
    title: 'Каналы',
    onClickPlusButton: handleNewGroupModal,
    items: state.groupList
  },
  {
    title: 'Личные сообщения',
    onClickPlusButton: handleNewContactModal,
    items: state.contactList
  }
]);

const pwaInstall = async (): Promise<void> => {
  if (state.installPrompt) {
    await state.installPrompt.prompt();
    state.installPrompt = null;
  }
};

onMounted(() => {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    state.installPrompt = event;
  });

  fetchConversationList();
});
</script>
