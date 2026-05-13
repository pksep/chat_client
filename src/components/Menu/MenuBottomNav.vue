<template>
  <nav
    v-if="authUser"
    :class="['menu-bottom-nav', $attrs.class]"
    :data-testid="`${props.dataTestid}-MenuBottomNav-Container`"
  >
    <button
      v-if="isSectionVisible('chats')"
      type="button"
      :class="getButtonClass('chats')"
      :data-testid="`${props.dataTestid}-MenuBottomNav-Chats`"
      @click="setActiveSection('chats')"
    >
      <span class="menu-bottom-nav__icon-shell" aria-hidden="true">
        <Icon :name="IconNameEnum.chat" class="menu-bottom-nav__icon" />
      </span>
    </button>

    <button
      v-if="isSectionVisible('calls')"
      type="button"
      :class="getButtonClass('calls')"
      :data-testid="`${props.dataTestid}-MenuBottomNav-Calls`"
      @click="setActiveSection('calls')"
    >
      <span class="menu-bottom-nav__icon-shell" aria-hidden="true">
        <Icon :name="IconNameEnum.calls" class="menu-bottom-nav__icon" />
      </span>
    </button>

    <button
      v-if="isSectionVisible('profile')"
      type="button"
      :class="getButtonClass('profile')"
      :data-testid="`${props.dataTestid}-MenuBottomNav-Profile`"
      @click="setActiveSection('profile')"
    >
      <span class="menu-bottom-nav__avatar-shell" aria-hidden="true">
        <CachedAvatar
          class="menu-bottom-nav__avatar"
          :path="authUser?.avatarUrl"
          :initials="authUser?.initials || authUser?.nickname || 'P'"
          is-icon
        />
      </span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import CachedAvatar from '../UI/CachedAvatar.vue';
import {
  type ChatMenuSection,
  useChatMenu
} from '../../composables/useChatMenu';
import { getAuthUser } from '../../composables/useAuth';
import { Icon, IconNameEnum } from '@pksep/yui';

const props = withDefaults(
  defineProps<{
    dataTestid?: string;
    isCollapse?: boolean;
  }>(),
  {
    dataTestid: 'MenuBottomNav',
    isCollapse: false
  }
);

defineOptions({
  inheritAttrs: false
});

const { activeSection, setActiveSection } = useChatMenu();

const authUser = computed(() => getAuthUser());

const getButtonClass = (section: ChatMenuSection) => [
  'menu-bottom-nav__button',
  {
    'menu-bottom-nav__button--active': activeSection.value === section
  }
];

const isSectionVisible = (section: ChatMenuSection): boolean =>
  !props.isCollapse || activeSection.value === section;
</script>
