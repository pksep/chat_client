<template>
  <nav
    v-if="authUser"
    ref="bottomNavRef"
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

    <div
      v-if="isSectionVisible('ai')"
      ref="aiControlRef"
      class="menu-bottom-nav__ai-control"
    >
      <button
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
          <AiAvatar />
          <span
            v-if="backgroundActivityStatus"
            :class="[
              'menu-bottom-nav__ai-status',
              `menu-bottom-nav__ai-status--${backgroundActivityStatus}`
            ]"
            role="status"
            :aria-label="
              getBackgroundActivityStatusLabel(backgroundActivityStatus)
            "
            :title="getBackgroundActivityStatusLabel(backgroundActivityStatus)"
          ></span>
        </span>
      </button>

      <button
        v-if="
          hasBackgroundActivities &&
          !isActivityPanelOpen &&
          backgroundActivityCount > 1
        "
        type="button"
        class="menu-bottom-nav__ai-toggle menu-bottom-nav__ai-toggle--count"
        :aria-label="
          isActivityPanelOpen
            ? 'Скрыть фоновые задачи ИИ'
            : 'Показать фоновые задачи ИИ'
        "
        :aria-expanded="isActivityPanelOpen"
        @mousedown.stop
        @touchstart.stop
        @click.stop="toggleActivityPanel"
      >
        {{ backgroundActivityCount }}
      </button>
      <Icon
        v-else-if="hasBackgroundActivities"
        :key="isActivityPanelOpen ? 'activity-open' : 'activity-closed'"
        :name="
          isActivityPanelOpen
            ? IconNameEnum.chevronDown
            : IconNameEnum.chevronUp
        "
        class="menu-bottom-nav__ai-toggle"
        role="button"
        tabindex="0"
        :aria-label="
          isActivityPanelOpen
            ? 'Скрыть фоновые задачи ИИ'
            : 'Показать фоновые задачи ИИ'
        "
        :aria-expanded="isActivityPanelOpen"
        @mousedown.stop
        @touchstart.stop
        @click.stop="toggleActivityPanel"
        @keydown.enter.stop="toggleActivityPanel"
        @keydown.space.prevent.stop="toggleActivityPanel"
      />
    </div>

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

    <Teleport to="body">
      <ContextMenu
        :visible="isActivityPanelOpen && hasBackgroundActivities"
        :position="activityPopoverPosition"
        :style="activityPopoverStyle"
        force-flip-y
        class="ai-activity-popover"
        data-testid="AI-ActivityPopover"
        @unmount-close="closeActivityPanel"
      >
        <AIActivityPanel
          :activities="backgroundActivities"
          @select="handleActivitySelect"
        />
      </ContextMenu>
    </Teleport>
  </nav>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import CachedAvatar from '../UI/CachedAvatar.vue';
import {
  type ChatMenuSection,
  useChatMenu
} from '../../composables/useChatMenu';
import { getAuthUser } from '../../composables/useAuth';
import { Icon, IconNameEnum } from '@pksep/yui';
import AiAvatar from '../AI/AiAvatar.vue';
import AIActivityPanel from '../AI/AIActivityPanel.vue';
import ContextMenu from '../ContactList/ContextMenu.vue';
import {
  type AiAssistantActivityStatus,
  useAiAssistant
} from '../../composables/useAiAssistant';
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
const { backgroundActivities, selectSession } = useAiAssistant();
const route = useUrlWatcher();
const isAiMenuEnabled = true;
const isActivityPanelOpen = ref(false);
const bottomNavRef = ref<HTMLElement | null>(null);
const aiControlRef = ref<HTMLElement | null>(null);
const activityPopoverPosition = ref({ x: 0, y: 0 });
const activityPopoverStyle = { width: '250px' };

const authUser = computed(() => getAuthUser());
const backgroundActivityCount = computed(
  () => backgroundActivities.value.length
);
const hasBackgroundActivities = computed(
  () => backgroundActivityCount.value > 0
);
const backgroundActivityStatus = computed(() => {
  if (
    backgroundActivities.value.some(activity => activity.status === 'attention')
  ) {
    return 'attention';
  }
  if (
    backgroundActivities.value.some(activity => activity.status === 'running')
  ) {
    return 'running';
  }
  return hasBackgroundActivities.value ? 'success' : null;
});

const getBackgroundActivityStatusLabel = (
  status: AiAssistantActivityStatus
): string => {
  if (status === 'running') return 'ИИ выполняет задачу';
  if (status === 'success') return 'Задача ИИ выполнена';
  return 'Задача ИИ требует внимания';
};

/** Считает AI-раздел активным сразу по открытому маршруту, без ожидания синхронизации меню. */
const isSectionActive = (section: ChatMenuSection): boolean =>
  activeSection.value === section ||
  (section === 'ai' &&
    (route.value.type === RouteTypes.AI ||
      route.value.type === RouteTypes.ASSISTANT));

const getButtonClass = (section: ChatMenuSection) => [
  'menu-bottom-nav__button',
  {
    'menu-bottom-nav__button--active': isSectionActive(section)
  }
];

const isSectionVisible = (section: ChatMenuSection): boolean =>
  !props.isCollapse || isSectionActive(section);

const toggleActivityPanel = (): void => {
  if (!isActivityPanelOpen.value) {
    const navRect = bottomNavRef.value?.getBoundingClientRect();
    const controlRect = aiControlRef.value?.getBoundingClientRect();
    if (navRect && controlRect) {
      activityPopoverPosition.value = {
        x: controlRect.left + controlRect.width / 2 - 125,
        y: navRect.top - 10
      };
    }
  }

  isActivityPanelOpen.value = !isActivityPanelOpen.value;
};

const closeActivityPanel = (event?: Event): void => {
  if (
    event?.target instanceof Element &&
    event.target.closest('.menu-bottom-nav__ai-toggle')
  ) {
    return;
  }

  isActivityPanelOpen.value = false;
};

const handleActivitySelect = (sessionId: string): void => {
  closeActivityPanel();
  setActiveSection('ai');
  selectSession(sessionId);
  navigateToAI(sessionId);
};

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

watch(hasBackgroundActivities, hasActivities => {
  if (!hasActivities) isActivityPanelOpen.value = false;
});
</script>
