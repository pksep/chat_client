<template>
  <aside :class="menuClasses">
    <div class="menu__start">
      <div class="menu__profile">
        <UserProfile
          v-bind="props.user"
          class="menu__user-profile"
          v-show="!state.isCollapse"
        />
        <Avatar
          v-if="state.isCollapse"
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
      <div :class="aiChapterClasses" @click="handleAiChapter">
        <AiIconWrapper />
        <h3 class="menu__user-assistant-title" v-if="!state.isCollapse">
          AI Ассистент
        </h3>
      </div>
      <template v-if="false">
        <Line v-if="state.isCollapse" />
        <details class="menu__user-details" v-if="!state.isCollapse" open>
          <summary class="menu__user-details-summary">
            <h4 @click="handleChannels">Каналы</h4>
            <Button
              :type="ButtonTypeEnum.ghost"
              :size="SizesEnum.little"
              @click="handleNewContactModal"
            >
              <Icon :name="IconNameEnum.plus" />
            </Button>
          </summary>
          <ContactList />
        </details>
        <template v-if="state.isCollapse">
          <ul class="menu__user">
            <li class="menu__user-avatar">
              <Avatar initials="Orange" />
            </li>
          </ul>
          <Line />
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
      <template v-if="!state.isCollapse"> Загрузить на устройство </template>
    </Button>
  </aside>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, reactive } from 'vue';
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
  isCollapse: false,
  chapter: '',
  installPrompt: null
});

const emits = defineEmits<IMenuEmits>();

let resizeHandler: (() => void) | undefined;

const handleCollapse = (): void => {
  state.isCollapse = !state.isCollapse;
  emits('unmount-collapse', state.isCollapse);
};

const handleNewContactModal = (): void => {
  emits('unmount-new-contact', true);
};

const handleAiChapter = (): void => {
  if (state.chapter === 'ai') {
    state.chapter = '';
    emits('unmount-chapter', null);
    return;
  }
  state.chapter = 'ai';
  emits('unmount-chapter', {
    name: 'ai'
  });
};

const menuClasses = computed(() => [
  'menu',
  { 'menu--collapse': state.isCollapse }
]);

const aiChapterClasses = computed(() => [
  'menu__user-assistant',
  {
    'menu__user-assistant--active': state.chapter === 'ai'
  }
]);

const handleChannels = (): void => {
  emits('unmount-chapter', { name: 'channels' });
};

const pwaInstall = async (): Promise<void> => {
  if (state.installPrompt) {
    await state.installPrompt.prompt();
    state.installPrompt = null;
  }
};

onMounted(() => {
  resizeHandler = () => {
    const width = window.innerWidth;
    if (width < 1280) {
      state.isCollapse = true;
      emits('unmount-collapse', state.isCollapse);
    }
    if (width > 1280) {
      state.isCollapse = false;
      emits('unmount-collapse', state.isCollapse);
    }
  };
  window.addEventListener('resize', resizeHandler);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    state.installPrompt = event;
  });
  resizeHandler();
});

onUnmounted(() => {
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
  }
});
</script>
