<template>
  <aside :class="['menu', { collapse: state.isCollapse }]">
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
      <Line />
      <div
        :class="[
          'menu__user-assistant',
          {
            active: state.chapter === 'ai'
          }
        ]"
        @click="handleAiChapter"
      >
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
import { onMounted, onUnmounted, reactive } from 'vue';
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

const props = withDefaults(defineProps<{ user: IUserProps }>(), {
  user: () => ({
    // avatarUrl: '/avatar-user.png',
    avatarAlt: 'User with a circle face',
    name: 'Jonn Doe',
    nickname: 'JonnDoe'
  })
});

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

<style scoped>
.menu {
  display: grid;
  padding: 10px;
  border-right-width: 0.5px;
  border-right-style: solid;
  border-right-color: var(--grey13);
  background-color: var(--white);
  overflow-y: auto;
}

.menu__start {
  display: grid;
  gap: 10px;
  padding: 10px;
  align-content: start;
}

.menu.collapse {
  justify-items: center;
  gap: 0;
  padding: 10px;

  & .menu__start {
    padding: 0;
  }

  & .line {
    margin-top: 0;
  }
}

.menu.collapse .menu__profile {
  --size-avatar: 50px;
  justify-items: center;
  justify-content: center;
  margin-bottom: 10px;
  grid-template-areas:
    'collapse collapse'
    'profile profile';
}

.menu__profile {
  display: grid;
  align-self: start;
  width: 100%;
  align-items: center;
  grid-template-areas:
    'profile collapse'
    'profile collapse';
}

.menu__user-avatar {
  padding: 10px;
}

.menu__user-profile {
  grid-area: profile;
}

.menu:not(.collapse) button.menu__user-profile-collapse {
  justify-self: end;
}

.menu__user-assistant {
  &:hover,
  &.active {
    background-color: var(--blue15);
  }
}

button.menu__user-profile-collapse {
  grid-area: collapse;
  display: grid;
  padding: 2px;
  align-items: center;
  color: var(--grey4);
  background-color: var(--white);
}

.menu__user-profile-collapse-icon {
  background-color: var(--white);
}

.menu__user-assistant {
  padding: 10px;
  display: flex;
  align-self: start;
  align-items: center;
  gap: 10px;
}

.menu__user-assistant-title {
  color: var(--text-black);
  font-size: 14px;
}

details.menu__user-details {
  &:not([open]) summary.menu__user-details-summary h4::after {
    transform: rotate(135deg);
  }
}

summary.menu__user-details-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 5px;
  color: var(--text-grey);
  &::marker {
    display: none;
  }
  & svg {
    font-size: 12px;
  }
  & h4 {
    margin: 0;
  }
  & h4::after {
    display: inline-block;
    content: '▾';
    font-size: 12px;
    vertical-align: top;
    text-align: center;
    margin-left: 6px;
    transition: transform 0.3s ease;
  }

  font-weight: bold;
}

.menu__button-install-prompt {
  display: flex;
  justify-content: center;
  gap: 10px;
  align-self: end;
}

.menu__button-install-prompt.ghost-yui-kit {
  color: var(--text-grey);
  padding-block: 10px;
  & svg.icon-yui-kit {
    font-size: 16px;
  }
}

:deep(.avatar-yui-kit:has(.avatar-yui-kit__text)) {
  min-width: 40px;
  width: 40px;
  min-height: 40px;
}

@media (width <= 1280px) {
  .menu:not(.collapse) {
    width: var(--default-width);
    z-index: 2;
  }
}
</style>
