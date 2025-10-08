<template>
  <aside :class="['menu', { collapse: state.isCollapse }]">
    <div class="menu__profile">
      <UserProfile class="menu__user-profile" v-show="!state.isCollapse" />
      <Avatar
        url="/avatar-user.png"
        alt="avatar-user"
        initials="Orange"
        v-if="state.isCollapse"
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
      <div class="menu__user-assistant-icon">
        <AiIcon />
      </div>
      <h3 class="menu__user-assistant-title" v-if="!state.isCollapse">
        AI Ассистент
      </h3>
    </div>
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
  </aside>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, reactive } from 'vue';
import AiIcon from '../components/AiIcon.vue';
import Line from './Line.vue';
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
import type { IMenuEmits } from './interfaces/interfaces';

const state = reactive({
  isCollapse: false,
  chapter: ''
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

onMounted(() => {
  resizeHandler = () => {
    const width = window.innerWidth;
    if (width < 896) {
      state.isCollapse = true;
      emits('unmount-collapse', state.isCollapse);
    }
    if (width > 896) {
      state.isCollapse = false;
      emits('unmount-collapse', state.isCollapse);
    }
  };
  window.addEventListener('resize', resizeHandler);
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
  align-content: start;
  padding: 20px;
  border-right-width: 0.5px;
  border-right-style: solid;
  border-right-color: var(--grey13);
  background-color: var(--white);
  overflow-y: auto;
  gap: 10px;
}

.menu.collapse {
  justify-items: center;
  gap: 0;
  padding: 10px;

  & .line {
    margin-top: 0;
  }
}

.menu.collapse > .menu__profile {
  --size-avatar: 50px;
  justify-items: center;
  margin-bottom: 10px;
  grid-template-areas:
    'collapse collapse'
    'profile profile';
}

.menu__profile {
  display: grid;
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
  align-items: center;
  gap: 10px;
}

.menu__user-assistant-title {
  color: var(--text-black);
  font-size: 14px;
}

.menu__user-assistant-icon {
  display: grid;
  background-color: var(--blue9);
  color: var(--blue1);
  border-radius: 50%;
  padding: 7px;
  & svg {
    font-size: 16px;
  }
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
</style>
