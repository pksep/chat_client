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
      @click="handleSection('chats')"
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
      @click="handleSection('calls')"
    >
      <span class="menu-bottom-nav__icon-shell" aria-hidden="true">
        <Icon :name="IconNameEnum.calls" class="menu-bottom-nav__icon" />
      </span>
    </button>

    <button
      v-if="isSectionVisible('ai')"
      type="button"
      :class="getButtonClass('ai')"
      :data-testid="`${props.dataTestid}-MenuBottomNav-AI`"
      :disabled="!isAiMenuEnabled"
      aria-label="ИИ-Ассистент"
      @click="handleSection('ai')"
    >
      <span
        class="menu-bottom-nav__icon-shell menu-bottom-nav__ai-shell"
        aria-hidden="true"
      >
        <AiSparkleIcon />
        <small class="menu-bottom-nav__beta">BETA</small>
      </span>
    </button>

    <button
      v-if="isSectionVisible('profile')"
      type="button"
      :class="getButtonClass('profile')"
      :data-testid="`${props.dataTestid}-MenuBottomNav-Profile`"
      @click="handleSection('profile')"
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
import AiSparkleIcon from '../AI/AiSparkleIcon.vue';
import {
  navigateToAI,
  navigateToAssistant,
  navigateToDefault,
  useUrlWatcher
} from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';

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
const route = useUrlWatcher();
const isAiMenuEnabled = true;

const authUser = computed(() => getAuthUser());

const getButtonClass = (section: ChatMenuSection) => [
  'menu-bottom-nav__button',
  {
    'menu-bottom-nav__button--active': activeSection.value === section
  }
];

const isSectionVisible = (section: ChatMenuSection): boolean =>
  !props.isCollapse || activeSection.value === section;

const handleSection = (section: ChatMenuSection): void => {
  setActiveSection(section);

  if (section === 'ai') {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) {
      navigateToAssistant();
    } else {
      navigateToAI();
    }
    return;
  }

  if (
    route.value.type === RouteTypes.AI ||
    route.value.type === RouteTypes.ASSISTANT
  ) {
    navigateToDefault();
  }
};
</script>
