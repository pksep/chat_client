<template>
  <ul
    v-menu-list-press
    ref="listRootRef"
    :class="['contact-list', props.class]"
    role="list"
    :data-testid="`${props.dataTestid}-ContactList-List`"
    :aria-label="`${props.dataTestid} Contact List`"
    @scroll.passive="closeCompactTopicPopover"
  >
    <li
      v-if="showContactSectionTitle"
      class="contact-list__section-title"
      :data-testid="`${props.dataTestid}-ContactList-ContactsTitle`"
    >
      Контакты
    </li>
    <template v-if="showTopicListSkeleton">
      <li
        v-for="index in skeletonRows"
        :key="`topic-skeleton-${index}`"
        class="contact-list__li contact-list__skeleton-row"
        role="presentation"
        aria-hidden="true"
        :data-testid="`${props.dataTestid}-ContactList-Skeleton${index}`"
      >
        <div class="contact-list__item contact-list__skeleton-item">
          <SkeletonBlock class="contact-list__skeleton-avatar" />
          <div class="contact-list__skeleton-content">
            <SkeletonBlock class="contact-list__skeleton-line" />
            <SkeletonBlock
              class="contact-list__skeleton-line contact-list__skeleton-line--short"
            />
          </div>
        </div>
      </li>
    </template>
    <li
      v-for="(topic, index) in displayTopics"
      :key="topic.id"
      :class="[
        'contact-list__li menu-list-row',
        { 'menu-list-row--active': isTopicActive(topic) }
      ]"
      :data-topic-id="topic.id"
      role="listitem"
      tabindex="0"
      @keydown="event => handleKeyDown(topic, index, event)"
      :data-testid="`${props.dataTestid}-ContactList-Item${index + 1}`"
    >
      <div
        :class="[
          'contact-list__item menu-list-item',
          {
            'contact-list__item--active': isTopicActive(topic),
            'contact-list__item--selection': props.showCheckbox
          }
        ]"
        role="button"
        tabindex="0"
        :aria-expanded="isOpen[topic.id] ? 'true' : 'false'"
        :aria-haspopup="true"
        @pointerdown="event => handleTopicPress(topic, event)"
        @pointerenter="event => handleCompactTopicEnter(topic, index, event)"
        @pointerleave="scheduleCompactTopicClose"
        @pointermove="handleTopicPressMove"
        @pointerup="handleTopicPressEnd"
        @pointercancel="handleTopicPressCancel"
        @click="event => handleClick(topic, index, event)"
        @contextmenu="
          !props.showCheckbox && openActivePopover(topic.id, $event)
        "
        @keydown.enter="event => handleClick(topic, index, event)"
        @keydown.space="event => handleClick(topic, index, event)"
      >
        <span class="contact-list__avatar-shell">
          <FavoriteTopicIcon
            v-if="isTopicFavorite(topic)"
            class="contact-list__avatar"
            :data-testid="`${props.dataTestid}-ContactList-Avatar${index + 1}`"
          />
          <component
            v-else
            :is="isBotTopic(topic) ? BotAvatar : CachedAvatar"
            :class="[
              'contact-list__avatar',
              {
                'contact-list__avatar--interactive':
                  !props.showCheckbox &&
                  topic.type === TopicType.DM &&
                  !isTopicFavorite(topic)
              }
            ]"
            :initials="topic.name"
            :path="getTopicAvatarPath(topic)"
            :alt="`Avatar of ${topic.name}`"
            :data-testid="`${props.dataTestid}-ContactList-Avatar${index + 1}`"
            is-icon
            :is-online="isTopicUserOnline(topic)"
          />
          <span
            v-if="
              props.isCollapse &&
              getTopicUnreadBadgeCount(topic, authedUser?.id) > 0
            "
            :class="[
              'menu-bottom-nav__unread-count',
              {
                'menu-bottom-nav__unread-count--muted':
                  topic.info?.isMute && !topic.taggedMe
              }
            ]"
            :data-testid="`${props.dataTestid}-ContactList-AvatarUnread${index + 1}`"
            aria-hidden="true"
          >
            {{
              unreadBadgeLabel(getTopicUnreadBadgeCount(topic, authedUser?.id))
            }}
          </span>
        </span>
        <TopicListItemContent
          :topic="topic"
          :index="index"
          :data-testid="props.dataTestid"
          :show-checkbox="props.showCheckbox"
          :show-last-online="props.showLastOnline"
          :current-time="currentTime"
          @reaction-click="event => handleReactionClick(topic, index, event)"
        />
        <Checkbox
          v-if="props.showCheckbox"
          class="contact-list__selection-checkbox"
          :size="CheckboxSizeEnum.small"
          :model-value="props.selectedTopicIds.has(topic.id)"
          @click.stop
          @update:model-value="() => handleClick(topic, index)"
          :data-testid="`${props.dataTestid}-ContactList-Checkbox${index + 1}`"
        />
      </div>
      <TopicFolderContextMenu
        v-if="!props.showCheckbox && isOpen[topic.id]"
        :topic-id="topic.id"
        :scope="
          props.folderScope || (isClientTopic(topic) ? 'clients' : 'chats')
        "
        :position="position"
        :data-testid="`${props.dataTestid}-ContactList-ContextMenu${index + 1}`"
        @close="() => closeActivePopover(topic.id)"
      >
        <template #before>
          <Button
            :type="ButtonTypeEnum.popover"
            :size="SizesEnum.small"
            @click.stop="() => handlePin(topic)"
            :data-testid="`${props.dataTestid}-ContactList-PinButton${index + 1}`"
            :aria-label="
              topic.info.isPin ? `Unpin ${topic.name}` : `Pin ${topic.name}`
            "
          >
            <template v-if="!topic.info.isPin">
              <PinIcon /> Закрепить
            </template>
            <template v-else> <UnpinIcon /> Открепить </template>
          </Button>
          <Button
            :type="ButtonTypeEnum.popover"
            :size="SizesEnum.small"
            @click.stop="() => handleReadState(topic)"
            :data-testid="`${props.dataTestid}-ContactList-ReadStateButton${index + 1}`"
            :aria-label="
              hasTopicUnreadIndicator(topic, authedUser?.id)
                ? `Mark ${topic.name} as read`
                : `Mark ${topic.name} as new`
            "
          >
            <template v-if="hasTopicUnreadIndicator(topic, authedUser?.id)">
              <ReadIcon style="padding: 2px" /> Отметить прочитанным
            </template>
            <template v-else
              ><Icon :name="IconNameEnum.chat" style="padding: 2px" /> Пометить
              как новое</template
            >
          </Button>
        </template>
        <template #after>
          <Button
            :type="ButtonTypeEnum.popover"
            :size="SizesEnum.small"
            @click="() => handleMute(topic)"
            :data-testid="`${props.dataTestid}-ContactList-NotificationButton${index + 1}`"
            :aria-label="
              topic.info.isMute
                ? `Disable notifications for ${topic.name}`
                : `Enable notifications for ${topic.name}`
            "
            :class="{ 'red-context-button': !topic.info.isMute }"
          >
            <template v-if="topic.info.isMute">
              <UnmuteIcon /> Вкл. уведомления
            </template>
            <template v-else><MuteIcon /> Выкл. уведомления </template>
          </Button>
        </template>
      </TopicFolderContextMenu>
    </li>
    <li
      v-if="paginated && hasMoreTopics"
      ref="paginationSentinelRef"
      class="contact-list__pagination"
      role="presentation"
      :data-testid="`${props.dataTestid}-ContactList-LoadMore`"
    >
      <span v-if="loadingMoreTopics" role="status">Загрузка…</span>
    </li>
    <li
      v-if="showMessageSectionTitle"
      class="contact-list__section-title"
      :data-testid="`${props.dataTestid}-ContactList-MessagesTitle`"
    >
      Сообщения
    </li>
    <li
      v-if="showMessageSearchLoading"
      class="contact-list__search-state"
      :data-testid="`${props.dataTestid}-ContactList-MessageSearchLoading`"
    >
      Поиск сообщений...
    </li>
    <li
      v-for="(result, index) in props.messageResults"
      :key="`message-${result.id}`"
      class="contact-list__li menu-list-row"
      :class="{ 'contact-list__li--search-notes': result.pinComments?.length }"
      role="listitem"
      tabindex="0"
      :data-testid="`${props.dataTestid}-ContactList-MessageResult${index + 1}`"
      @keydown.enter="handleMessageResultClick(result)"
      @keydown.space="handleMessageResultClick(result)"
    >
      <div
        class="contact-list__item contact-list__item--message-result menu-list-item"
        role="button"
        tabindex="0"
        @click="handleMessageResultClick(result)"
      >
        <FavoriteTopicIcon
          v-if="isTopicFavorite(getMessageResultTopic(result))"
          class="contact-list__avatar"
          :data-testid="`${props.dataTestid}-ContactList-MessageAvatar${index + 1}`"
        />
        <component
          v-else
          :is="
            isBotTopic(getMessageResultTopic(result)) ? BotAvatar : CachedAvatar
          "
          class="contact-list__avatar"
          :initials="getMessageResultTopicName(result)"
          :path="getMessageResultTopicAvatar(result)"
          :alt="`Avatar of ${getMessageResultTopicName(result)}`"
          is-icon
          :is-online="isBotTopic(getMessageResultTopic(result))"
          :data-testid="`${props.dataTestid}-ContactList-MessageAvatar${index + 1}`"
        />
        <div class="contact-list__block--wrapper">
          <h5
            role="heading"
            aria-level="5"
            class="contact-list__title"
            :data-testid="`${props.dataTestid}-ContactList-MessageTitle${index + 1}`"
          >
            <span class="contact-list__title-text">
              {{ getMessageResultTopicName(result) }}
            </span>
          </h5>
          <div
            class="contact-list__description"
            v-emoji
            :data-testid="`${props.dataTestid}-ContactList-MessageDescription${index + 1}`"
          >
            {{ result.previewText }}
          </div>
          <div
            v-if="result.pinComments?.length"
            class="contact-list__search-pin-comments"
            @keydown.stop
          >
            <PinCommentCard
              v-for="comment in result.pinComments"
              :key="comment.id"
              :comment="comment"
              :own="false"
            />
          </div>
          <div class="contact-list__top">
            <span
              v-if="result.createdAt"
              class="contact-list__time"
              :data-testid="`${props.dataTestid}-ContactList-MessageTime${index + 1}`"
            >
              {{ formatListTime(new Date(result.createdAt)) }}
            </span>
          </div>
        </div>
      </div>
    </li>
    <li
      v-if="showSearchEmptyState"
      class="contact-list__search-state contact-list__search-state--empty"
      :data-testid="`${props.dataTestid}-ContactList-SearchEmpty`"
    >
      <p class="contact-list__search-state-title">Ничего не найдено</p>

      <svg
        width="84"
        height="84"
        viewBox="0 0 84 84"
        fill="none"
        class="contact-list__empty-icon"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M40.3971 70.8724C57.2303 70.8724 70.8763 57.2264 70.8763 40.3932C70.8763 23.5601 57.2303 9.91406 40.3971 9.91406C23.564 9.91406 9.91797 23.5601 9.91797 40.3932C9.91797 57.2264 23.564 70.8724 40.3971 70.8724Z"
          stroke="currentColor"
          stroke-width="4.8125"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M74.0846 74.0807L67.668 67.6641"
          stroke="currentColor"
          stroke-width="4.8125"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <circle cx="25.5" cy="35.3359" r="3.5" fill="currentColor" />
        <circle cx="55.168" cy="35.3359" r="3.5" fill="currentColor" />
        <line
          x1="27.086"
          y1="46.9141"
          x2="53.586"
          y2="46.9148"
          stroke="currentColor"
          stroke-width="3.5"
          stroke-linecap="round"
        />
      </svg>
    </li>
  </ul>

  <Teleport to="body">
    <div
      v-if="isMobile && hasOpenTopicContextMenu"
      class="contact-list__context-menu-dismiss-layer"
      aria-hidden="true"
      @touchstart.stop
      @pointerdown.stop
      @pointerup.stop
      @click.stop.prevent="dismissTopicContextMenu"
      @contextmenu.stop.prevent="dismissTopicContextMenu"
    ></div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="compactHoverTopic"
      ref="compactPopoverRef"
      :class="[
        'contact-list__compact-popover',
        {
          'contact-list__compact-popover--active': isTopicActive(
            compactHoverTopic.topic
          )
        }
      ]"
      :style="compactPopoverStyle"
      role="button"
      tabindex="0"
      :aria-label="`Открыть чат ${compactHoverTopic.topic.name}`"
      :data-testid="`${props.dataTestid}-ContactList-CompactPopover`"
      @pointerenter="cancelCompactTopicClose"
      @pointerleave="scheduleCompactTopicClose"
      @click="event => handleCompactPopoverClick(event)"
      @keydown.enter.prevent="event => handleCompactPopoverClick(event)"
      @keydown.space.prevent="event => handleCompactPopoverClick(event)"
    >
      <TopicListItemContent
        :key="compactHoverTopic.topic.id"
        :topic="compactHoverTopic.topic"
        :index="compactHoverTopic.index"
        :data-testid="`${props.dataTestid}-CompactPopover`"
        :current-time="currentTime"
        force-description-fade
        @reaction-click="
          event =>
            handleReactionClick(
              compactHoverTopic.topic,
              compactHoverTopic.index,
              event
            )
        "
      />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { unreadBadgeLabel } from '../../utils/unread-badge-label';
import { vMenuListPress } from '../../directives/menu-list-press';
import SkeletonBlock from '../UI/SkeletonBlock.vue';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'vue';
import { useContextMenu } from '../../composables/useContextMenu';
import {
  Button,
  ButtonTypeEnum,
  Checkbox,
  CheckboxSizeEnum,
  Icon,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';
import TopicFolderContextMenu from './TopicFolderContextMenu.vue';
import { isClientTopic } from '../../composables/useManagerInquiries';
import type { ChatFolderScope } from '../../services/useChatSDK/chat-folder';
import CachedAvatar from '../UI/CachedAvatar.vue';
import BotAvatar from '../UI/BotAvatar.vue';
import type { IContactListProps } from './interfaces/contact-list';
import { getAuthUser } from '../../composables/useAuth';
import { IMessage, ITopic } from '../interfaces/interfaces';
import { getTopicsRefreshFailed, useTopics } from '../../composables/useTopics';
import { formatListTime } from '../../composables/useTime';
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';
import {
  navigateToDialogs,
  navigateToFavorites,
  navigateToGroup
} from '../../composables/navigation';
import { MediaType } from '@pksep/zod-shared-chat';
import PinIcon from '../UI/PinIcon.vue';
import PinCommentCard from '../Messages/PinCommentCard.vue';
import UnpinIcon from '../UI/UnpinIcon.vue';
import UnmuteIcon from '../UI/UnmuteIcon.vue';
import MuteIcon from '../UI/MuteIcon.vue';
import ReadIcon from '../UI/ReadIcon.vue';
import { TopicType } from '../../services/useChatSDK/types';
import { getUserLastOnline } from '../../composables/useUsers';
import {
  getHasBrowserNetwork,
  getHasWebsocketConnection,
  markAsRead
} from '../../services/useChat';
import {
  getTopicUnreadBadgeCount,
  hasTopicUnreadIndicator
} from '../../utils/topicUnreadBadge';
import {
  activeCallTopicId,
  isCallActive,
  pendingGroupCallInfo
} from '../../services/useCallState';
import type { IMessageSearchResult } from '../../composables/useMessageSearch';
import { isBotTopic, isDeletedBotUser } from '../../utils/bot';
import FavoriteTopicIcon from '../UI/FavoriteTopicIcon.vue';
import TopicListItemContent from './TopicListItemContent.vue';
import { requestTopicReactionJump } from '../../services/useTopicViewportState';
import {
  getInteractionTelemetryPayload,
  recordChatTopicNavigationRequest,
  recordChatTopicOpenAttempt,
  type ChatTopicOpenTelemetryMeta
} from '../../services/useChatNavigationTelemetry';
import { isFavoriteTopic } from '../../utils/favorite-topic';
import {
  getFullMessagesByTopicId,
  isDeletedMessageForTopic,
  hasKnownTopicMessagesState,
  hydrateMessagePreviewFromCache,
  hydrateMessagesFromCache
} from '../../services/useMessages';
import { resolveTopicLastMessage } from '../../utils/topic-last-message';
import { preloadAvatarPath } from '../../services/avatar-image-verification';

interface IExtendedContactListProps extends IContactListProps {
  paginated?: boolean;
  showCheckbox?: boolean;
  showLastOnline?: boolean;
  selectedTopicIds?: Set<string | number>;
  searchQuery?: string;
  toolbarFilter?: string;
  messageResults?: IMessageSearchResult[];
  isMessageSearchLoading?: boolean;
  isLoading?: boolean;
  isCollapse?: boolean;
  folderScope?: ChatFolderScope;
}

const {
  togglePinTopic,
  toggleMuteTopic,
  setTopicMarkedUnread,
  resetTopicUnreadState,
  getTopicUnreadReactionMessageId,
  hasMoreTopics,
  loading: loadingTopics,
  loadingMoreTopics,
  loadMoreTopics,
  loadRemainingTopics
} = useTopics();

const props = withDefaults(defineProps<IExtendedContactListProps>(), {
  showCheckbox: false,
  showLastOnline: false,
  selectedTopicIds: () => new Set<string | number>(),
  searchQuery: '',
  toolbarFilter: '',
  messageResults: () => [],
  isMessageSearchLoading: false,
  isLoading: false,
  isCollapse: false
});

const emits = defineEmits<{
  (e: 'unmount-notification', id: string): void;
  (e: 'unmount-click', id: string): void;
  (
    e: 'unmount-topic',
    contact: ITopic,
    telemetry?: ChatTopicOpenTelemetryMeta | null
  ): void;
  (e: 'unmount-message', result: IMessageSearchResult): void;
}>();

watch(
  [
    () => props.paginated,
    () => props.searchQuery,
    () => props.toolbarFilter,
    () => props.showCheckbox,
    hasMoreTopics
  ],
  () => {
    if (
      props.paginated &&
      (props.searchQuery?.trim() ||
        (props.toolbarFilter && props.toolbarFilter !== 'all') ||
        props.showCheckbox)
    )
      void loadRemainingTopics();
  },
  { immediate: true }
);

const { state: isMobile } = useResizeState(MAX_W_MD);

const {
  isOpen,
  position,
  openActivePopover,
  closeActivePopover,
  startTouchLongPress
} = useContextMenu();

const hasOpenTopicContextMenu = computed(() =>
  Object.values(isOpen.value).some(Boolean)
);

const authedUser = computed(() => getAuthUser());
const isTopicFavorite = (topic?: ITopic | null): boolean =>
  isFavoriteTopic(topic, authedUser.value?.id);
const getClientLastMessage = (topic: ITopic) => {
  const messages = getFullMessagesByTopicId(topic.id);

  return isTopicFavorite(topic)
    ? [...messages].reverse().find(message => !message.isSystem)
    : messages.at(-1);
};
const startupTopicsPending = ref(
  isMobile.value && !!document.getElementById('startup-shell')
);
const initialTopicCount = Math.ceil(window.innerHeight / 64) + 2;
const displayTopics = computed(() =>
  (startupTopicsPending.value && !props.searchQuery && !props.showCheckbox
    ? props.topics.slice(0, initialTopicCount)
    : props.topics
  ).map(topic => {
    const lastMessage = resolveTopicLastMessage(
      topic.lastMessage && isDeletedMessageForTopic(topic.id, topic.lastMessage)
        ? undefined
        : topic.lastMessage,
      getClientLastMessage(topic)
    );

    return lastMessage === topic.lastMessage
      ? topic
      : { ...topic, lastMessage };
  })
);
// Переподключение обновляет реактивные статусы, сохраняя DOM и наблюдатели превью.
const listRootRef = ref<HTMLElement | null>(null);
const paginationSentinelRef = ref<HTMLElement | null>(null);
let paginationObserver: IntersectionObserver | null = null;
const syncPaginationObserver = (): void => {
  paginationObserver?.disconnect();
  const sentinel = paginationSentinelRef.value;
  if (
    !sentinel ||
    loadingTopics.value ||
    startupTopicsPending.value ||
    typeof IntersectionObserver === 'undefined'
  )
    return;

  paginationObserver = new IntersectionObserver(async entries => {
    if (
      !entries.some(entry => entry.isIntersecting) ||
      loadingTopics.value ||
      loadingMoreTopics.value ||
      startupTopicsPending.value
    )
      return;

    await loadMoreTopics();
    // После успеха заполняем свободное место, после ошибки ждём новой прокрутки.
    if (paginationSentinelRef.value === sentinel && !getTopicsRefreshFailed())
      syncPaginationObserver();
  });
  paginationObserver.observe(sentinel);
};
watch(
  [paginationSentinelRef, loadingTopics, startupTopicsPending],
  syncPaginationObserver,
  { flush: 'post' }
);
onBeforeUnmount(() => {
  paginationObserver?.disconnect();
  paginationObserver = null;
});
const pendingActiveTopicId = ref<string | null>(null);
const compactHoverTopic = ref<{ topic: ITopic; index: number } | null>(null);
const compactPopoverRef = ref<HTMLElement | null>(null);
const compactPopoverPosition = ref({ left: 0, top: 0 });
const compactPopoverStyle = computed(() => ({
  left: `${compactPopoverPosition.value.left}px`,
  top: `${compactPopoverPosition.value.top}px`
}));
let compactTopicCloseTimer: number | null = null;
const currentTime = ref(Date.now());
let currentTimeInterval: ReturnType<typeof setInterval> | null = null;
let startupTopicsFrame = 0;
let startupTopicsIdle = 0;
const revealRemainingStartupTopics = (): void => {
  startupTopicsPending.value = false;
  if (startupTopicsFrame) cancelAnimationFrame(startupTopicsFrame);
  if (startupTopicsIdle) window.cancelIdleCallback(startupTopicsIdle);
  startupTopicsFrame = 0;
  startupTopicsIdle = 0;
  document.removeEventListener('scroll', revealStartupTopicsOnScroll, true);
  void nextTick(syncTopicCacheObserver);
};
const revealStartupTopicsOnScroll = (event: Event): void => {
  if (
    event.target instanceof Element &&
    listRootRef.value &&
    event.target.contains(listRootRef.value)
  )
    revealRemainingStartupTopics();
};
const scheduleRemainingStartupTopics = (): void => {
  if (!startupTopicsPending.value) return;
  if (document.getElementById('startup-shell')) {
    startupTopicsFrame = requestAnimationFrame(scheduleRemainingStartupTopics);
    return;
  }
  startupTopicsFrame = requestAnimationFrame(() => {
    startupTopicsFrame = requestAnimationFrame(() => {
      if ('requestIdleCallback' in window) {
        startupTopicsIdle = window.requestIdleCallback(
          revealRemainingStartupTopics,
          { timeout: 500 }
        );
      } else revealRemainingStartupTopics();
    });
  });
};
let descriptionOverflowRafId = 0;
let descriptionOverflowSecondRafId = 0;
let descriptionMutationObserver: MutationObserver | null = null;
let descriptionResizeObserver: ResizeObserver | null = null;
let topicCacheObserver: IntersectionObserver | null = null;
let topicCacheWarmFrame = 0;
let isStartupTopicCacheWarmReady =
  typeof document === 'undefined' || !document.getElementById('startup-shell');
let activeTopicCacheWarmCount = 0;
const queuedTopicCacheWarmIds: string[] = [];
const queuedTopicCacheWarmSet = new Set<string>();
const activeTopicCacheWarmIds = new Set<string>();
const pendingTopicCacheWarms = new Map<string, Promise<IMessage[]>>();
const TOPIC_PRESS_SCROLL_CANCEL_PX = 8;
const TOPIC_POINTER_CLICK_MAX_DELAY_MS = 2000;
const TOPIC_CACHE_PREVIEW_LIMIT = 48;
const MAX_CONCURRENT_TOPIC_CACHE_WARMS = 2;
const TOPIC_OPEN_CACHE_WAIT_MS = 80;
// The first mobile frame only contains a few recent sender groups. Starting
// dozens of IndexedDB reads and image decodes at once delays those visible
// avatars on Android, so prioritize a compact recent set before navigation.
const TOPIC_AVATAR_PRELOAD_LIMIT = 8;
let topicPressPointerId: number | null = null;
let topicPressStartX = 0;
let topicPressStartY = 0;
let topicPressMoved = false;
let topicPointerDownContext: {
  topicId: string;
  timestamp: number;
} | null = null;
let topicOpenPreparationToken = 0;

const hasSearchQuery = computed(() => props.searchQuery.trim().length > 0);
const skeletonRows = 7;
const showTopicListSkeleton = computed(
  () =>
    props.isLoading &&
    !props.showCheckbox &&
    !hasSearchQuery.value &&
    props.topics.length === 0
);
const showContactSectionTitle = computed(
  () => hasSearchQuery.value && !props.showCheckbox && props.topics.length > 0
);
const showMessageSectionTitle = computed(
  () =>
    hasSearchQuery.value &&
    !props.showCheckbox &&
    props.messageResults.length > 0
);
const showMessageSearchLoading = computed(
  () =>
    hasSearchQuery.value &&
    !props.showCheckbox &&
    props.isMessageSearchLoading &&
    props.topics.length === 0 &&
    props.messageResults.length === 0
);
const showSearchEmptyState = computed(
  () =>
    hasSearchQuery.value &&
    !props.showCheckbox &&
    !props.isLoading &&
    !props.isMessageSearchLoading &&
    props.topics.length === 0 &&
    props.messageResults.length === 0
);

const preloadTopicMessageAvatars = async (
  messages: IMessage[],
  allowNetwork: boolean
): Promise<void> => {
  const paths: string[] = [];
  const knownPaths = new Set<string>();

  for (
    let index = messages.length - 1;
    index >= 0 && paths.length < TOPIC_AVATAR_PRELOAD_LIMIT;
    index -= 1
  ) {
    const path = messages[index]?.senderUser?.avatarUrl;
    if (!path || knownPaths.has(path)) continue;
    knownPaths.add(path);
    paths.push(path);
  }

  await Promise.all(
    paths.map(path => preloadAvatarPath(path, { allowNetwork }))
  );
};

const hydrateTopicPreviewForOpen = (topicId: string): Promise<IMessage[]> => {
  const existing = pendingTopicCacheWarms.get(topicId);
  if (existing) return existing;
  const hydration = hydrateMessagePreviewFromCache(
    topicId,
    undefined,
    TOPIC_CACHE_PREVIEW_LIMIT,
    { fallbackToSnapshot: true }
  ).finally(() => {
    if (pendingTopicCacheWarms.get(topicId) === hydration)
      pendingTopicCacheWarms.delete(topicId);
  });
  pendingTopicCacheWarms.set(topicId, hydration);
  return hydration;
};

const runQueuedTopicCacheWarms = (): void => {
  // IntersectionObserver видит строки и под стартовым экраном. Чтение историй
  // и декодирование аватаров этих чатов должны начинаться после готового списка.
  if (!isStartupTopicCacheWarmReady) {
    if (!topicCacheWarmFrame) {
      topicCacheWarmFrame = requestAnimationFrame(() => {
        topicCacheWarmFrame = 0;
        if (document.getElementById('startup-shell')) {
          runQueuedTopicCacheWarms();
          return;
        }
        topicCacheWarmFrame = requestAnimationFrame(() => {
          topicCacheWarmFrame = 0;
          isStartupTopicCacheWarmReady = true;
          runQueuedTopicCacheWarms();
        });
      });
    }
    return;
  }
  while (
    activeTopicCacheWarmCount < MAX_CONCURRENT_TOPIC_CACHE_WARMS &&
    queuedTopicCacheWarmIds.length > 0
  ) {
    const topicId = queuedTopicCacheWarmIds.shift();
    if (!topicId) continue;

    queuedTopicCacheWarmSet.delete(topicId);
    if (hasKnownTopicMessagesState(topicId)) continue;

    activeTopicCacheWarmCount += 1;
    activeTopicCacheWarmIds.add(topicId);
    void hydrateTopicPreviewForOpen(topicId)
      .then(messages => {
        // Фоновый прогрев декодирует только локальные изображения и не
        // обращается к CDN для топика, который пользователь ещё не открыл.
        void preloadTopicMessageAvatars(messages, false);
      })
      .catch(() => undefined)
      .finally(() => {
        activeTopicCacheWarmCount -= 1;
        activeTopicCacheWarmIds.delete(topicId);
        runQueuedTopicCacheWarms();
      });
  }
};

const warmTopicMessagesFromCache = (
  topicId: string,
  prioritize = false
): void => {
  if (
    (isMobile.value && getHasBrowserNetwork() && !prioritize) ||
    !topicId ||
    props.showCheckbox ||
    hasKnownTopicMessagesState(topicId) ||
    activeTopicCacheWarmIds.has(topicId)
  ) {
    return;
  }

  if (queuedTopicCacheWarmSet.has(topicId)) {
    if (prioritize) {
      const index = queuedTopicCacheWarmIds.indexOf(topicId);
      if (index > 0) {
        queuedTopicCacheWarmIds.splice(index, 1);
        queuedTopicCacheWarmIds.unshift(topicId);
      }
    }
  } else {
    queuedTopicCacheWarmSet.add(topicId);
    if (prioritize) queuedTopicCacheWarmIds.unshift(topicId);
    else queuedTopicCacheWarmIds.push(topicId);
  }

  runQueuedTopicCacheWarms();
};

const prepareTopicMessagesForOpen = async (topicId: string): Promise<void> => {
  if (!topicId) return;
  if (isMobile.value && getHasBrowserNetwork()) {
    if (hasKnownTopicMessagesState(topicId)) return;
    // Список остаётся видимым, пока короткий кеш готовится к первому кадру.
    await Promise.race([
      hydrateTopicPreviewForOpen(topicId).catch(() => undefined),
      new Promise<void>(resolve =>
        window.setTimeout(resolve, TOPIC_OPEN_CACHE_WAIT_MS)
      )
    ]);
    return;
  }

  if (!hasKnownTopicMessagesState(topicId)) {
    warmTopicMessagesFromCache(topicId, true);
  }
  const cachedMessagesReady = hasKnownTopicMessagesState(topicId)
    ? Promise.resolve(getFullMessagesByTopicId(topicId))
    : hydrateMessagesFromCache(topicId, undefined, {
        visibleLimit: TOPIC_CACHE_PREVIEW_LIMIT,
        allowVisibleShrink: true
      });
  await Promise.race([
    cachedMessagesReady
      .then(messages => preloadTopicMessageAvatars(messages, true))
      .then(() => undefined)
      .catch(() => undefined),
    new Promise<void>(resolve =>
      window.setTimeout(resolve, TOPIC_OPEN_CACHE_WAIT_MS)
    )
  ]);
};

const syncTopicCacheObserver = async (): Promise<void> => {
  if (typeof IntersectionObserver === 'undefined' || props.showCheckbox) return;

  await nextTick();
  topicCacheObserver?.disconnect();
  topicCacheObserver = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const topicId = (entry.target as HTMLElement).dataset.topicId;
        if (topicId) warmTopicMessagesFromCache(topicId);
      }
    },
    {
      root: listRootRef.value?.parentElement || null,
      rootMargin: '240px 0px'
    }
  );
  listRootRef.value
    ?.querySelectorAll<HTMLElement>('.contact-list__li[data-topic-id]')
    .forEach(element => topicCacheObserver?.observe(element));
};

const isTopicActive = (topic: ITopic): boolean =>
  topic.id === pendingActiveTopicId.value ||
  !!isOpen.value[topic.id] ||
  props.selectedTopicIds.has(topic.id) ||
  (!isMobile.value && topic.id === props.selectedTopicId);

const cancelDescriptionOverflowSync = (): void => {
  if (descriptionOverflowRafId) {
    window.cancelAnimationFrame(descriptionOverflowRafId);
    descriptionOverflowRafId = 0;
  }

  if (descriptionOverflowSecondRafId) {
    window.cancelAnimationFrame(descriptionOverflowSecondRafId);
    descriptionOverflowSecondRafId = 0;
  }
};

const getDescriptionOverflowCandidates = (
  element: HTMLElement
): HTMLElement[] => [
  element,
  ...Array.from(element.querySelectorAll<HTMLElement>('p, strong'))
];

const syncDescriptionOverflowState = (): void => {
  const root = listRootRef.value;

  if (!root) {
    return;
  }

  const descriptions = Array.from(
    root.querySelectorAll<HTMLElement>('.contact-list__description')
  );

  // Сначала все измерения, затем стили: запись класса не запускает layout каждой строки.
  const overflows = descriptions.map(description =>
    getDescriptionOverflowCandidates(description).some(
      element =>
        element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1
    )
  );
  descriptions.forEach((description, index) => {
    description.classList.toggle(
      'contact-list__description--overflow',
      overflows[index]
    );
  });
};

const scheduleDescriptionOverflowSync = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  nextTick(() => {
    cancelDescriptionOverflowSync();
    descriptionOverflowRafId = window.requestAnimationFrame(() => {
      descriptionOverflowRafId = 0;
      syncDescriptionOverflowState();

      descriptionOverflowSecondRafId = window.requestAnimationFrame(() => {
        descriptionOverflowSecondRafId = 0;
        syncDescriptionOverflowState();
      });
    });
  });
};

onMounted(() => {
  if (startupTopicsPending.value) {
    document.addEventListener('scroll', revealStartupTopicsOnScroll, true);
    startupTopicsFrame = requestAnimationFrame(scheduleRemainingStartupTopics);
  }
  currentTimeInterval = setInterval(() => {
    currentTime.value = Date.now();
  }, 1000);

  window.addEventListener('resize', scheduleDescriptionOverflowSync);

  if ('MutationObserver' in window && listRootRef.value) {
    descriptionMutationObserver = new MutationObserver(() => {
      scheduleDescriptionOverflowSync();
    });
    descriptionMutationObserver.observe(listRootRef.value, {
      attributes: true,
      attributeFilter: ['data-emoji-ready', 'src'],
      characterData: true,
      childList: true,
      subtree: true
    });
  }

  if ('ResizeObserver' in window && listRootRef.value) {
    descriptionResizeObserver = new ResizeObserver(() => {
      scheduleDescriptionOverflowSync();
    });
    descriptionResizeObserver.observe(listRootRef.value);
  }

  scheduleDescriptionOverflowSync();
  void syncTopicCacheObserver();
});

onBeforeUnmount(() => {
  closeCompactTopicPopover();
  if (startupTopicsFrame) cancelAnimationFrame(startupTopicsFrame);
  if (startupTopicsIdle) window.cancelIdleCallback(startupTopicsIdle);
  document.removeEventListener('scroll', revealStartupTopicsOnScroll, true);
  if (currentTimeInterval) {
    clearInterval(currentTimeInterval);
    currentTimeInterval = null;
  }

  window.removeEventListener('resize', scheduleDescriptionOverflowSync);
  cancelDescriptionOverflowSync();
  if (topicCacheWarmFrame) cancelAnimationFrame(topicCacheWarmFrame);
  descriptionMutationObserver?.disconnect();
  descriptionMutationObserver = null;
  descriptionResizeObserver?.disconnect();
  descriptionResizeObserver = null;
  topicCacheObserver?.disconnect();
  topicCacheObserver = null;
  queuedTopicCacheWarmIds.length = 0;
  queuedTopicCacheWarmSet.clear();
});

watch(
  () => props.isCollapse,
  isCollapse => {
    if (!isCollapse) {
      closeCompactTopicPopover();
    }
  }
);

watch(
  [
    () => props.topics,
    () => props.messageResults,
    () => props.searchQuery,
    () => props.isMessageSearchLoading,
    () => props.showCheckbox
  ],
  scheduleDescriptionOverflowSync,
  { deep: true, immediate: true }
);

watch(
  [
    () => props.topics.map(topic => topic.id).join('|'),
    () => props.showCheckbox
  ],
  () => void syncTopicCacheObserver()
);

const handlePin = (topic: ITopic): void => {
  togglePinTopic(topic);
  closeActivePopover(topic.id);
};

const handleMute = (topic: ITopic): void => {
  toggleMuteTopic(topic);
  closeActivePopover(topic.id);
};

const markTopicRead = async (
  topic: ITopic,
  opts: { closePopover?: boolean } = {}
): Promise<void> => {
  if (topic.lastMessage?.id) {
    await markAsRead({
      topicId: topic.id,
      messageIds: [topic.lastMessage.id]
    });
  }

  await setTopicMarkedUnread(topic, false);
  resetTopicUnreadState(topic.id);

  if (opts.closePopover) {
    closeActivePopover(topic.id);
  }
};

const handleReadState = async (topic: ITopic): Promise<void> => {
  if (hasTopicUnreadIndicator(topic, authedUser.value?.id)) {
    await markTopicRead(topic, { closePopover: true });
    return;
  }

  await setTopicMarkedUnread(topic, true);
  closeActivePopover(topic.id);
};

const getVisibleTopicIds = (): string[] =>
  props.topics.map(item => item.id).filter(Boolean);

const getTopicTelemetryFlags = (topic: ITopic): Record<string, unknown> => ({
  hasUnreadIndicator: hasTopicUnreadIndicator(topic, authedUser.value?.id),
  unreadCount: getTopicUnreadBadgeCount(topic, authedUser.value?.id),
  isMarkedUnread: !!topic.info?.isMarkedUnread,
  isPinned: !!topic.info?.isPin,
  isMuted: !!topic.info?.isMute,
  taggedMe: !!topic.taggedMe,
  hasUnreadReaction: !!topic.hasUnreadReaction,
  unreadReactionMessageId: getTopicUnreadReactionMessageId(topic.id) || null,
  hasActiveCall: !!getTopicActiveCall(topic),
  isFavorite: isTopicFavorite(topic),
  lastMessageId: topic.lastMessage?.id || null,
  lastMessageCreatedAt: topic.lastMessage?.createdAt || null,
  lastMessageMediaCount: topic.lastMessage?.media?.length || 0,
  lastMessageHasVideo:
    topic.lastMessage?.media?.some(media => media.type === MediaType.Video) ||
    false,
  lastMessageSenderIsMe:
    topic.lastMessage?.senderUserId === authedUser.value?.id
});

const recordTopicOpenAttempt = (
  topic: ITopic,
  index?: number,
  event?: Event,
  source = 'topic_list.click'
): ChatTopicOpenTelemetryMeta | null => {
  if (props.showCheckbox) {
    return null;
  }

  return recordChatTopicOpenAttempt({
    topicId: topic.id,
    topicType: isTopicFavorite(topic) ? 'FAVORITE' : topic.type,
    source,
    selectedTopicId: props.selectedTopicId,
    isMobile: isMobile.value,
    showCheckbox: props.showCheckbox,
    searchActive: hasSearchQuery.value,
    searchLength: props.searchQuery.trim().length,
    toolbarFilter: props.toolbarFilter,
    visibleTopicIds: getVisibleTopicIds(),
    clickedIndex: index,
    interaction: getInteractionTelemetryPayload(event),
    topicFlags: getTopicTelemetryFlags(topic)
  });
};

const navigateToTopicFromList = (
  topic: ITopic,
  telemetry: ChatTopicOpenTelemetryMeta | null,
  source: string
): void => {
  recordChatTopicNavigationRequest({
    telemetry,
    topicId: topic.id,
    topicType: isTopicFavorite(topic) ? 'FAVORITE' : topic.type,
    source
  });

  if (isTopicFavorite(topic)) {
    navigateToFavorites(topic.id);
  } else if (topic.type === TopicType.DM) {
    navigateToDialogs(topic.id);
  } else if (topic.type === TopicType.Group) {
    navigateToGroup(topic.id);
  }
};

const navigateToTopicRoute = (topic: ITopic): void => {
  if (isTopicFavorite(topic)) {
    navigateToFavorites(topic.id);
  } else if (topic.type === TopicType.DM) {
    navigateToDialogs(topic.id);
  } else if (topic.type === TopicType.Group) {
    navigateToGroup(topic.id);
  }
};

const syncTopicOpenSideEffects = (
  topic: ITopic,
  index?: number,
  event?: Event,
  source = 'topic_list.click',
  navigationSource = 'topic_list.mobile_navigation'
): void => {
  const telemetry = recordTopicOpenAttempt(topic, index, event, source);

  recordChatTopicNavigationRequest({
    telemetry,
    topicId: topic.id,
    topicType: isTopicFavorite(topic) ? 'FAVORITE' : topic.type,
    source: navigationSource
  });

  if (hasTopicUnreadIndicator(topic, authedUser.value?.id)) {
    void markTopicRead(topic);
  } else if (topic.info?.isMarkedUnread) {
    void setTopicMarkedUnread(topic, false);
  }
};

const clearTopicPointerDownContext = (): void => {
  topicPointerDownContext = null;
};

const dismissTopicContextMenu = (): void => {
  clearTopicPointerDownContext();
  topicPressPointerId = null;
  topicPressMoved = false;
  pendingActiveTopicId.value = null;
  closeActivePopover();
};

const resolveTopicClickTarget = (
  topic: ITopic,
  index?: number,
  event?: Event
): { topic: ITopic; index?: number } | null => {
  if (
    !event ||
    event instanceof KeyboardEvent ||
    (event instanceof MouseEvent && event.detail === 0)
  ) {
    clearTopicPointerDownContext();
    return { topic, index };
  }

  if (!topicPointerDownContext) {
    return { topic, index };
  }

  const pointerDownContext = topicPointerDownContext;
  clearTopicPointerDownContext();

  if (
    Date.now() - pointerDownContext.timestamp >
      TOPIC_POINTER_CLICK_MAX_DELAY_MS ||
    pointerDownContext.topicId === topic.id
  ) {
    return { topic, index };
  }

  const pointerDownTopicIndex = props.topics.findIndex(
    item => item.id === pointerDownContext.topicId
  );

  if (pointerDownTopicIndex === -1) {
    return null;
  }

  return {
    topic: props.topics[pointerDownTopicIndex],
    index: pointerDownTopicIndex
  };
};

const cancelCompactTopicClose = (): void => {
  if (!compactTopicCloseTimer) {
    return;
  }

  clearTimeout(compactTopicCloseTimer);
  compactTopicCloseTimer = null;
};

const closeCompactTopicPopover = (): void => {
  cancelCompactTopicClose();
  compactHoverTopic.value = null;
};

const scheduleCompactTopicClose = (): void => {
  cancelCompactTopicClose();
  compactTopicCloseTimer = window.setTimeout(() => {
    compactTopicCloseTimer = null;
    compactHoverTopic.value = null;
  }, 120);
};

const getCompactPopoverTop = (
  anchorTop: number,
  popoverHeight: number
): number => {
  const viewportPadding = 10;
  const maximumTop = Math.max(
    viewportPadding,
    window.innerHeight - popoverHeight - viewportPadding
  );

  return Math.min(Math.max(anchorTop, viewportPadding), maximumTop);
};

const handleCompactTopicEnter = (
  topic: ITopic,
  index: number,
  event: PointerEvent
): void => {
  if (!props.isCollapse || isMobile.value || props.showCheckbox) {
    return;
  }

  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  cancelCompactTopicClose();
  const targetRect = target.getBoundingClientRect();
  const menuRect = target.closest('.menu')?.getBoundingClientRect();

  compactPopoverPosition.value = {
    left: (menuRect?.right ?? targetRect.right) + 10,
    top: getCompactPopoverTop(targetRect.top, targetRect.height)
  };
  compactHoverTopic.value = { topic, index };

  void nextTick(() => {
    if (compactHoverTopic.value?.topic.id !== topic.id) return;

    const popoverHeight =
      compactPopoverRef.value?.getBoundingClientRect().height ||
      targetRect.height;
    compactPopoverPosition.value = {
      ...compactPopoverPosition.value,
      top: getCompactPopoverTop(targetRect.top, popoverHeight)
    };
  });
};

const handleClick = async (
  topic: ITopic,
  index?: number,
  event?: Event
): Promise<void> => {
  if (isMobile.value && topicPressMoved && !(event instanceof KeyboardEvent)) {
    clearTopicPointerDownContext();
    pendingActiveTopicId.value = null;
    topicPressMoved = false;
    return;
  }

  if (props.showCheckbox) {
    emits('unmount-topic', topic);
    return;
  }

  const clickTarget = resolveTopicClickTarget(topic, index, event);

  if (!clickTarget) {
    return;
  }

  const { topic: targetTopic, index: targetIndex } = clickTarget;
  const preparationToken = ++topicOpenPreparationToken;
  pendingActiveTopicId.value = targetTopic.id;
  await prepareTopicMessagesForOpen(targetTopic.id);
  if (preparationToken !== topicOpenPreparationToken) return;
  pendingActiveTopicId.value = null;

  if (isMobile.value) {
    emits('unmount-topic', targetTopic, null);
    navigateToTopicRoute(targetTopic);

    window.setTimeout(() => {
      syncTopicOpenSideEffects(
        targetTopic,
        targetIndex,
        event,
        event instanceof KeyboardEvent
          ? 'topic_list.keyboard'
          : 'topic_list.click',
        'topic_list.mobile_navigation'
      );
    }, 0);

    return;
  }

  const telemetry = recordTopicOpenAttempt(
    targetTopic,
    targetIndex,
    event,
    event instanceof KeyboardEvent ? 'topic_list.keyboard' : 'topic_list.click'
  );

  if (hasTopicUnreadIndicator(targetTopic, authedUser.value?.id)) {
    void markTopicRead(targetTopic);
  } else if (targetTopic.info?.isMarkedUnread) {
    void setTopicMarkedUnread(targetTopic, false);
  }

  emits('unmount-topic', targetTopic, telemetry);
};

const handleCompactPopoverClick = (event: Event): void => {
  const hoverTopic = compactHoverTopic.value;
  if (!hoverTopic) {
    return;
  }

  if (hasTopicUnreadIndicator(hoverTopic.topic, authedUser.value?.id)) {
    resetTopicUnreadState(hoverTopic.topic.id);
    void setTopicMarkedUnread(hoverTopic.topic, false);
  }

  closeCompactTopicPopover();
  void handleClick(hoverTopic.topic, hoverTopic.index, event);
};

const handleTopicPress = (topic: ITopic, event: PointerEvent): void => {
  if (props.showCheckbox) {
    return;
  }

  if (event.pointerType === 'mouse' && event.button !== 0) {
    return;
  }

  clearTopicPointerDownContext();
  topicPointerDownContext = {
    topicId: topic.id,
    timestamp: Date.now()
  };

  warmTopicMessagesFromCache(topic.id, true);

  if (event.pointerType === 'touch' && event.isPrimary) {
    startTouchLongPress(topic.id, event, {
      cancelOnScroll: true,
      isTargetPresent: () =>
        !props.showCheckbox &&
        !!listRootRef.value?.querySelector(
          `[data-topic-id="${CSS.escape(topic.id)}"]`
        )
    });
  }

  if (!isMobile.value) {
    return;
  }

  topicPressPointerId = event.pointerId;
  topicPressStartX = event.clientX;
  topicPressStartY = event.clientY;
  topicPressMoved = false;
  pendingActiveTopicId.value = topic.id;
};

const handleTopicPressMove = (event: PointerEvent): void => {
  if (
    topicPressPointerId === null ||
    event.pointerId !== topicPressPointerId ||
    !pendingActiveTopicId.value
  ) {
    return;
  }

  const deltaX = event.clientX - topicPressStartX;
  const deltaY = event.clientY - topicPressStartY;

  if (
    Math.hypot(deltaX, deltaY) < TOPIC_PRESS_SCROLL_CANCEL_PX &&
    Math.abs(deltaY) < TOPIC_PRESS_SCROLL_CANCEL_PX
  ) {
    return;
  }

  topicPressMoved = true;
  pendingActiveTopicId.value = null;
};

const handleTopicPressEnd = (event: PointerEvent): void => {
  if (topicPressPointerId === event.pointerId) {
    pendingActiveTopicId.value = null;
  }

  topicPressPointerId = null;
};

const handleTopicPressCancel = (): void => {
  clearTopicPointerDownContext();
  topicPressPointerId = null;
  topicPressMoved = false;
  pendingActiveTopicId.value = null;
};

const handleReactionClick = (
  topic: ITopic,
  index?: number,
  event?: Event
): void => {
  const unreadReactionMessageId = getTopicUnreadReactionMessageId(topic.id);

  if (!unreadReactionMessageId) {
    return;
  }

  const telemetry = recordTopicOpenAttempt(
    topic,
    index,
    event,
    'topic_list.reaction_click'
  );

  requestTopicReactionJump(topic.id, unreadReactionMessageId);

  if (isMobile.value) {
    navigateToTopicFromList(topic, telemetry, 'topic_list.reaction_navigation');
  }

  emits('unmount-topic', topic, telemetry);
};

const handleKeyDown = (
  contact: ITopic,
  index: number,
  event: KeyboardEvent
): void => {
  if (event.key === 'Enter' || event.key === ' ') {
    handleClick(contact, index, event);
  }
};

const handleMessageResultClick = (result: IMessageSearchResult): void => {
  emits('unmount-message', result);
};

const getMessageResultTopic = (result: IMessageSearchResult): ITopic | null =>
  result.topic || null;

const getMessageResultTopicName = (result: IMessageSearchResult): string =>
  getMessageResultTopic(result)?.name || 'Сообщение';

const getMessageResultTopicAvatar = (result: IMessageSearchResult): string =>
  getTopicAvatarPath(getMessageResultTopic(result));

const getTopicAvatarPath = (topic?: ITopic | null): string =>
  isBotTopic(topic) ? topic?.user?.avatarUrl || '' : topic?.avatarUrl || '';

const isTopicUserOnline = (topic: ITopic): boolean => {
  if (isTopicFavorite(topic) || isDeletedBotUser(topic.user)) {
    return false;
  }

  return (
    isBotTopic(topic) ||
    (topic.type === TopicType.DM &&
      !!topic.user &&
      getUserLastOnline(topic.user) === null &&
      getHasWebsocketConnection())
  );
};

const getTopicActiveCall = (topic: ITopic) => {
  if (isTopicFavorite(topic)) {
    return null;
  }

  if (isCallActive.value && activeCallTopicId.value === topic.id) {
    return {
      roomId: topic.activeCall?.roomId || topic.id,
      startTime: topic.activeCall?.startTime ?? null
    };
  }

  return pendingGroupCallInfo.value?.[topic.id] || null;
};
</script>

<style scoped>
.contact-list__li--search-notes .contact-list__item--message-result {
  height: auto;
  align-items: flex-start;
}
.contact-list__li--search-notes .contact-list__avatar {
  align-self: flex-start;
  margin-top: 8px;
}
.contact-list__search-pin-comments {
  grid-column: 1 / -1;
  min-width: 0;
  padding: 0 0 8px;
}
.contact-list__search-pin-comments :deep(.pin-note) {
  min-width: 0;
  max-width: calc(100% - 20px);
}
.contact-list__search-pin-comments :deep(.pin-note__text) {
  overflow-wrap: anywhere;
}
.contact-list__pagination {
  display: flex;
  justify-content: center;
  min-height: 36px;
  padding: 8px;
  color: var(--text-light-color);
  font-size: 14px;
}
.contact-list__avatar--interactive {
  cursor: pointer;
}

.contact-list__description--typing {
  color: var(--text-brand);
}

.contact-list__block--wrapper--selection {
  --description-fade-width: 56px;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas:
    'title'
    'preview';
}

.contact-list__selection-checkbox {
  margin-left: 12px;
  align-self: center;
  flex-shrink: 0;
}

.contact-list__call-indicator {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 20px;
}

.contact-list__call-indicator-icon {
  color: var(--status-success);
  width: 20px;
  transform: rotate(-120deg);
}

.contact-list__time--call {
  font-size: 12px;
  line-height: 15px;
  font-weight: 400;
  width: 50px;
}

.contact-list__section-title {
  padding: 8px 16px 4px;
  color: var(--text-light-color);
  font-size: 13px;
  line-height: 18px;
}

.contact-list__search-state {
  padding: 32px 16px;
  color: var(--text-light-color);
  font-size: 14px;
  line-height: 20px;
  text-align: center;
}

.contact-list__search-state--empty {
  padding: 100px 16px 0;
}

.contact-list__item--message-result {
  cursor: pointer;
}

.contact-list__skeleton-row {
  pointer-events: none;
}

.contact-list__skeleton-item {
  align-items: center;
  cursor: default;
}

.contact-list__empty-icon {
  color: var(--border-table);
}

.contact-list__skeleton-avatar {
  width: 50px;
  height: 50px;
  flex: 0 0 50px;
  border-radius: 50%;
}

.contact-list__skeleton-content {
  display: grid;
  gap: 9px;
  width: 100%;
}

:global(.menu--collapse) .contact-list__skeleton-content {
  display: none;
}

.contact-list__skeleton-line {
  width: 78%;
  height: 14px;
  border-radius: 6px;
}

.contact-list__skeleton-line--short {
  width: 54%;
  height: 12px;
}

@media (width > 768px) {
  .contact-list__skeleton-avatar {
    width: calc(var(--size-avatar) * 2);
    height: calc(var(--size-avatar) * 2);
    flex-basis: calc(var(--size-avatar) * 2);
  }

  .contact-list__skeleton-content {
    grid-template-rows: 20px 22px;
    align-items: center;
    align-self: stretch;
    min-width: 0;
    padding: 10px 0 6px;
    gap: 0;
    box-sizing: border-box;
  }
}
</style>
