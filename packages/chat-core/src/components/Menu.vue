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
              @click="handleNewContactModal"
            >
              <Icon :name="IconNameEnum.plus" />
            </Button>
          </summary>
          <ContactList
            :contacts="item.contacts"
            @unmount-click="unmountContactClick"
          />
        </details>
        <template v-if="isCollapse">
          <template v-for="(user, index) in item.contacts" :key="index">
            <ul class="menu__user">
              <li class="menu__user-avatar">
                <Avatar :url="user.imageURL" :initials="user.title" />
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
import Line from './Line.vue';
import AiIconWrapper from './AiIconWrapper.vue';
import {
  Icon,
  Button,
  Avatar,
  ButtonTypeEnum,
  IconNameEnum,
  SizesEnum
} from 'sep-yui';
import UserProfile from './UserProfile/UserProfile.vue';
import ContactList from './ContactList/ContactList.vue';
import type { IMenuEmits, IUserProps } from './interfaces/interfaces';

const props = withDefaults(defineProps<{ user: IUserProps }>(), {});

const state = reactive({
  chapter: '',
  installPrompt: null
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

const handleNewContactModal = (): void => {
  emits('unmount-new-contact', { isChapterOpen: true });
};

const unmountContactClick = (contact): void => {
  if (state.chapter === 'ai') {
    state.chapter = '';
    emits('unmount-chapter', null);
    return;
  }
  state.chapter = contact.title;
  emits('unmount-chapter', {
    name: contact.title,
    contact: {
      id: contact.id,
      name: contact.title,
      avatarUrl: contact.imageURL || '',
      nickname: contact.nickname || ''
    }
  });
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

const listChannels = [
  {
    title: 'Каналы'
  },
  {
    title: 'Личные сообщения',
    contacts: [
      {
        id: 't1',
        title: 'Jare Milkovich',
        imageURL: 'https://example.com/avatar1.jpg',
        isPin: true,
        nickname: 'jare',
        latestMessage: 'Hello!',
        notificationCount: 2
      },
      {
        id: 't2',
        title: 'Jane Smith',
        imageURL: 'https://example.com/avatar2.jpg',
        nickname: 'jane',
        isPin: false,
        latestMessage: 'Hi!',
        notificationCount: 1
      }
    ]
  }
];

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
});
</script>
