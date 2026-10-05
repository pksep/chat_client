<template>
  <nav
    v-if="authUser"
    ref="bottomNavRef"
    :class="[
      'menu-bottom-nav',
      {
        'menu-bottom-nav--collapse': props.isCollapse
      },
      $attrs.class
    ]"
    :style="{ '--menu-section-count': menuSectionCount }"
    :aria-busy="!accessSettled"
    :aria-label="accessSettled ? undefined : 'Загрузка меню'"
    :data-testid="`${props.dataTestid}-MenuBottomNav-Container`"
  >
    <template v-if="!accessSettled">
      <SkeletonBlock
        v-for="index in menuSectionCount"
        :key="index"
        class="menu-bottom-nav__skeleton"
        :class="{
          'menu-bottom-nav__skeleton--neutral':
            !props.isCollapse && !cachedMenuCount
        }"
      />
    </template>
    <template v-else>
      <button
        v-if="props.isCollapse && previousSection"
        type="button"
        class="menu-bottom-nav__switch menu-bottom-nav__switch--previous"
        :aria-label="`Перейти в раздел «${sectionLabels[previousSection]}»`"
        :title="sectionLabels[previousSection]"
        @click="handleSection(previousSection)"
      >
        <Icon :name="IconNameEnum.chevronLeft" />
      </button>

      <button
        v-if="isSectionVisible('chats')"
        type="button"
        :class="getButtonClass('chats')"
        :data-testid="`${props.dataTestid}-MenuBottomNav-Chats`"
        :aria-label="getSectionAriaLabel('chats')"
        @click="handleSection('chats')"
      >
        <span class="menu-bottom-nav__icon-shell" aria-hidden="true">
          <Icon :name="IconNameEnum.chat" class="menu-bottom-nav__icon" />
          <span
            v-if="sectionBadgeState.chats.count"
            :class="[
              'menu-bottom-nav__unread-count',
              {
                'menu-bottom-nav__unread-count--muted':
                  sectionBadgeState.chats.isMuted
              }
            ]"
          >
            {{ sectionBadgeState.chats.count }}
          </span>
        </span>
      </button>

      <button
        v-if="isSectionVisible('calls')"
        type="button"
        :class="getButtonClass('calls')"
        :data-testid="`${props.dataTestid}-MenuBottomNav-Calls`"
        :aria-label="getSectionAriaLabel('calls')"
        @click="handleSection('calls')"
      >
        <span class="menu-bottom-nav__icon-shell" aria-hidden="true">
          <Icon :name="IconNameEnum.calls" class="menu-bottom-nav__icon" />
          <span
            v-if="sectionBadgeState.calls.count"
            :class="[
              'menu-bottom-nav__unread-count',
              {
                'menu-bottom-nav__unread-count--muted':
                  sectionBadgeState.calls.isMuted
              }
            ]"
          >
            {{ sectionBadgeState.calls.count }}
          </span>
        </span>
      </button>

      <button
        v-if="chatAccess.client && isSectionVisible('clients')"
        type="button"
        :class="getButtonClass('clients')"
        :data-testid="`${props.dataTestid}-MenuBottomNav-Clients`"
        :aria-label="getSectionAriaLabel('clients')"
        title="Клиенты"
        @click="handleSection('clients')"
      >
        <span class="menu-bottom-nav__icon-shell" aria-hidden="true">
          <Icon :name="IconNameEnum.headset" class="menu-bottom-nav__icon" />
          <span
            v-if="sectionBadgeState.clients.count"
            :class="[
              'menu-bottom-nav__unread-count',
              {
                'menu-bottom-nav__unread-count--muted':
                  sectionBadgeState.clients.isMuted
              }
            ]"
          >
            {{ sectionBadgeState.clients.count }}
          </span>
        </span>
      </button>

      <div
        v-if="chatAccess.ai && isSectionVisible('ai')"
        ref="aiControlRef"
        class="menu-bottom-nav__ai-control"
      >
        <button
          type="button"
          :class="getButtonClass('ai')"
          :data-testid="`${props.dataTestid}-MenuBottomNav-AI`"
          :disabled="!isAiMenuEnabled"
          :aria-label="getSectionAriaLabel('ai')"
          @click="handleSection('ai')"
        >
          <span
            class="menu-bottom-nav__icon-shell menu-bottom-nav__ai-shell"
            aria-hidden="true"
          >
            <AiAvatar />
            <span
              v-if="sectionBadgeState.ai.count"
              class="menu-bottom-nav__unread-count"
            >
              {{ sectionBadgeState.ai.count }}
            </span>
            <span
              v-if="backgroundActivityStatus"
              :class="[
                'menu-bottom-nav__ai-status',
                `menu-bottom-nav__ai-status--${backgroundActivityStatus}`,
                {
                  'menu-bottom-nav__ai-status--with-count':
                    sectionBadgeState.ai.count > 0
                }
              ]"
              role="status"
              :aria-label="
                getBackgroundActivityStatusLabel(backgroundActivityStatus)
              "
              :title="
                getBackgroundActivityStatusLabel(backgroundActivityStatus)
              "
            ></span>
          </span>
        </button>

        <Icon
          v-if="hasBackgroundActivities"
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

      <button
        v-if="props.isCollapse && nextSection"
        type="button"
        class="menu-bottom-nav__switch menu-bottom-nav__switch--next"
        :aria-label="`Перейти в раздел «${sectionLabels[nextSection]}»`"
        :title="sectionLabels[nextSection]"
        @click="handleSection(nextSection)"
      >
        <Icon :name="IconNameEnum.chevronRight" />
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
    </template>
  </nav>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import CachedAvatar from '../UI/CachedAvatar.vue';
import SkeletonBlock from '../UI/SkeletonBlock.vue';
import {
  type ChatMenuSection,
  useChatMenu
} from '../../composables/useChatMenu';
import { getAuthUser } from '../../composables/useAuth';
import { getTopicList } from '../../composables/useTopics';
import { Icon, IconNameEnum } from '@pksep/yui';
import {
  isClientTopic,
  useManagerInboxSubscription
} from '../../composables/useManagerInquiries';
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
import { isCallTopic } from '../../utils/call-topic';
import { getTopicsUnreadBadgeState } from '../../utils/chats-toolbar-filter-badge';
import { useCallHistoryStore } from '../../services/useCallHistory';
import { parseCallMessage } from '../../utils/parseCallMessage';
import { useCallUnreadState } from '../../services/useCallUnreadState';
import { useChatFolders } from '../../composables/useChatFolders';
import { useChatAccess } from '../../composables/useChatAccess';

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
const {
  access: chatAccess,
  settled: accessSettled,
  cachedMenuCount
} = useChatAccess();
const { closeFolderManager } = useChatFolders();
useManagerInboxSubscription();
const { backgroundActivities, selectSession } = useAiAssistant();
const { rawCallHistory } = useCallHistoryStore();
const route = useUrlWatcher();
const isAiMenuEnabled = true;
const isActivityPanelOpen = ref(false);
const bottomNavRef = ref<HTMLElement | null>(null);
const aiControlRef = ref<HTMLElement | null>(null);
const activityPopoverPosition = ref({ x: 0, y: 0 });
const activityPopoverStyle = { width: '250px' };
const sectionLabels: Record<ChatMenuSection, string> = {
  chats: 'Чаты',
  calls: 'Звонки',
  clients: 'Клиенты',
  ai: 'ИИ',
  profile: 'Профиль'
};

const authUser = computed(() => getAuthUser());
const { callsSeenAt, initializeCallsSeenState, markCallsSeen } =
  useCallUnreadState();

watch(
  () => authUser.value?.id,
  userId => initializeCallsSeenState(userId),
  { immediate: true }
);

const menuTopics = computed(() => getTopicList());
const chatsBadgeState = computed(() =>
  getTopicsUnreadBadgeState(
    menuTopics.value.filter(
      topic => !isClientTopic(topic) && !isCallTopic(topic)
    ),
    authUser.value?.id
  )
);
const clientsBadgeState = computed(() =>
  getTopicsUnreadBadgeState(
    menuTopics.value.filter(topic => isClientTopic(topic)),
    authUser.value?.id
  )
);
const newMissedCalls = computed(() =>
  rawCallHistory.value.filter(call => {
    const createdAt = new Date(call.createdAt).getTime();
    if (!Number.isFinite(createdAt) || createdAt <= callsSeenAt.value) {
      return false;
    }

    return (
      parseCallMessage(call.text || '', {
        messageEx: call.ex,
        authUserId: authUser.value?.id,
        isMeSender: call.senderUserId === authUser.value?.id
      })?.kind === 'missed'
    );
  })
);
const callsBadgeState = computed(() => ({
  count: newMissedCalls.value.length,
  isMuted:
    newMissedCalls.value.length > 0 &&
    newMissedCalls.value.every(call => {
      const sourceTopicId = Object.prototype.hasOwnProperty.call(
        call,
        'sourceTopicId'
      )
        ? call.sourceTopicId || null
        : call.topicId;
      const topic = sourceTopicId
        ? menuTopics.value.find(item => item.id === sourceTopicId)
        : undefined;

      return Boolean(topic?.info?.isMute) && !topic?.taggedMe;
    })
}));
const sectionBadgeState = computed(() => ({
  chats: chatsBadgeState.value,
  calls: callsBadgeState.value,
  clients: clientsBadgeState.value,
  ai: {
    count: backgroundActivities.value.length,
    isMuted: false
  }
}));

const getSectionAriaLabel = (section: ChatMenuSection): string => {
  if (section === 'profile') return sectionLabels[section];

  const count = sectionBadgeState.value[section].count;
  return count
    ? `${sectionLabels[section]}. Непрочитанных: ${count}`
    : sectionLabels[section];
};

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

const availableSections = computed<ChatMenuSection[]>(() => [
  'chats',
  'calls',
  ...(chatAccess.value.client ? (['clients'] as ChatMenuSection[]) : []),
  ...(chatAccess.value.ai ? (['ai'] as ChatMenuSection[]) : []),
  'profile'
]);
const menuSectionCount = computed(() => {
  if (props.isCollapse) return 1;
  return accessSettled.value
    ? availableSections.value.length
    : cachedMenuCount.value || 1;
});
const activeSectionIndex = computed(() =>
  availableSections.value.findIndex(section => isSectionActive(section))
);
const previousSection = computed<ChatMenuSection | null>(() => {
  const index = activeSectionIndex.value;
  return index > 0 ? availableSections.value[index - 1] : null;
});
const nextSection = computed<ChatMenuSection | null>(() => {
  const index = activeSectionIndex.value;
  return index >= 0 && index < availableSections.value.length - 1
    ? availableSections.value[index + 1]
    : null;
});

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
  closeFolderManager();
  if (section === 'calls') markCallsSeen(Date.now(), authUser.value?.id);
  setActiveSection(section);

  const selectedTopic = getTopicList().find(
    topic => topic.id === route.value.id
  );
  const selectedClient = isClientTopic(selectedTopic);
  if (
    route.value.id &&
    ((section === 'clients' && !selectedClient) ||
      (section === 'chats' && selectedClient))
  ) {
    navigateToDefault();
    return;
  }

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

watch(
  [() => activeSection.value, () => rawCallHistory.value[0]?.id],
  ([section]) => {
    if (section === 'calls') markCallsSeen(Date.now(), authUser.value?.id);
  },
  { immediate: true }
);
</script>
