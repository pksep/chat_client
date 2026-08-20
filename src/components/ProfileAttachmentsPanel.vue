<template>
  <section
    ref="attachmentsRootRef"
    class="profile-attachments"
    :data-testid="`${props.dataTestid}-Container`"
  >
    <div
      v-if="props.showTabs"
      class="profile-attachments__tabs"
      role="tablist"
      :data-testid="`${props.dataTestid}-Tabs`"
    >
      <button
        v-for="tab in tabs"
        :key="tab.value"
        type="button"
        role="tab"
        class="profile-attachments__tab"
        :class="{
          'profile-attachments__tab--active': currentTab === tab.value
        }"
        :aria-selected="currentTab === tab.value"
        :data-testid="`${props.dataTestid}-Tab-${tab.value}`"
        @click="setActiveTab(tab.value)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div
      v-if="currentTab === 'media'"
      class="profile-attachments__media-grid"
      :data-testid="`${props.dataTestid}-MediaGrid`"
    >
      <button
        v-for="(item, index) in mediaItems"
        :key="item.key"
        type="button"
        class="profile-attachments__media-tile"
        :data-attachment-key="item.key"
        :aria-label="getMediaLabel(item.media)"
        :data-attachment-month="getMonthYearLabel(item.message)"
        :data-testid="`${props.dataTestid}-MediaItem${index + 1}`"
        @click="handleAttachmentClick(mediaItems, index, $event)"
        @contextmenu.stop="openAttachmentContextMenu(item, $event)"
        @pointerdown="startAttachmentLongPress(item, $event)"
        @pointermove="handleAttachmentLongPressMove"
        @pointerup="cancelAttachmentLongPress"
        @pointercancel="cancelAttachmentLongPress"
        @pointerleave="cancelAttachmentLongPress"
      >
        <img
          :src="getMediaPreviewPath(item.media)"
          :alt="getMediaLabel(item.media)"
          loading="lazy"
          decoding="async"
        />
        <span
          v-if="item.media.type === MediaType.Video"
          class="profile-attachments__media-play"
          aria-hidden="true"
        >
          <PlayIcon />
        </span>
        <span
          v-if="getVideoDurationLabel(item.media)"
          class="profile-attachments__media-duration"
        >
          {{ getVideoDurationLabel(item.media) }}
        </span>
      </button>
    </div>

    <ul
      v-else
      class="profile-attachments__file-list"
      :data-testid="`${props.dataTestid}-FileList`"
    >
      <li
        v-for="(item, index) in fileItems"
        :key="item.key"
        class="profile-attachments__file-item"
      >
        <button
          type="button"
          class="profile-attachments__file-button"
          :class="{
            'profile-attachments__file-button--outgoing': isOutgoingMessage(
              item.message
            )
          }"
          :data-attachment-key="item.key"
          :data-attachment-month="getMonthYearLabel(item.message)"
          :data-testid="`${props.dataTestid}-FileItem${index + 1}`"
          @click="handleAttachmentClick(fileItems, index, $event)"
          @contextmenu.stop="openAttachmentContextMenu(item, $event)"
          @pointerdown="startAttachmentLongPress(item, $event)"
          @pointermove="handleAttachmentLongPressMove"
          @pointerup="cancelAttachmentLongPress"
          @pointercancel="cancelAttachmentLongPress"
          @pointerleave="cancelAttachmentLongPress"
        >
          <FileIcon
            :is-me-sender="isOutgoingMessage(item.message)"
            :is-loaded="isFileIconLoaded(item.media)"
            :percent="getFileIconPercent(item.media)"
            :icon="getFileIconType(item.media)"
            class="profile-attachments__file-icon"
          />
          <span class="profile-attachments__file-copy">
            <span class="profile-attachments__file-name">
              {{ getShortName(item.media.originName || 'Файл') }}
            </span>
            <span class="profile-attachments__file-properties">
              <span class="profile-attachments__file-size">
                {{ getFormatFileSize(item.media.size) }}
              </span>
              <time
                v-if="getFileDateTime(item.message)"
                class="profile-attachments__file-date"
                :datetime="getFileDateTimeAttribute(item.message)"
              >
                {{ getFileDateTime(item.message) }}
              </time>
            </span>
          </span>
        </button>
      </li>
    </ul>

    <p
      v-if="isCurrentTabEmpty && !isHistoryLoading"
      class="profile-attachments__empty"
      :data-testid="`${props.dataTestid}-Empty`"
    >
      {{ emptyLabel }}
    </p>

    <div
      v-if="hasMoreHistory || isHistoryLoading"
      ref="loadMoreTriggerRef"
      class="profile-attachments__load-more"
      :data-testid="`${props.dataTestid}-LoadMore`"
    >
      <span v-if="isHistoryLoading">Загрузка...</span>
    </div>

    <Teleport
      v-if="scrollMonthLabel"
      to="body"
      :disabled="isInsideNativeDialog"
    >
      <div
        class="profile-attachments__scroll-month"
        :style="scrollMonthPosition"
        aria-hidden="true"
      >
        {{ scrollMonthLabel }}
      </div>
    </Teleport>

    <SliderModal
      v-if="sliderElements.length > 0"
      :open="true"
      :items="sliderElements"
      :default-index="defaultIndexSlider"
      @close="closeSlider"
      @keydown.escape.stop="closeSlider"
      @touchstart.stop
      @touchend.stop
    />

    <Teleport v-if="contextMenuItem" to="body" :disabled="isInsideNativeDialog">
      <ContextMenu
        class="profile-attachments__context-menu"
        :visible="isContextMenuOpen"
        :position="contextMenuPosition"
        :data-testid="`${props.dataTestid}-AttachmentContextMenu`"
        @unmount-close="closeAttachmentContextMenu"
      >
        <Button
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          :data-testid="`${props.dataTestid}-ShowInChatButton`"
          @click.stop="handleShowInChat"
        >
          <Icon :name="IconNameEnum.chat" />
          Показать в чате
        </Button>

        <Button
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          :data-testid="`${props.dataTestid}-ForwardButton`"
          @click.stop="handleOpenForwardModal"
        >
          <ForwardIcon />
          Переслать
        </Button>

        <Button
          v-if="canDeleteContextMessage"
          class="red-context-button"
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          :data-testid="`${props.dataTestid}-DeleteButton`"
          @click.stop="handleOpenDeleteModal"
        >
          <Icon :name="IconNameEnum.deleteSmall" />
          Удалить
        </Button>
      </ContextMenu>
    </Teleport>

    <ConfirmModal
      :open="deleteModalOpen"
      title="Удалить сообщение"
      description="Вы уверены, что хотите удалить сообщение для всех участников чата?"
      @unmount-close="handleCloseDeleteModal"
      @unmount-confirm="handleDeleteMessage"
    />

    <ForwardModal
      :open="forwardModalOpen"
      @unmount-close="handleCloseForwardModal"
      @unmount-select-topic="handleForwardMessage"
    />
  </section>
</template>

<script setup lang="ts">
import { Capacitor } from '@capacitor/core';
import { MediaType } from '@pksep/zod-shared-chat';
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  SizesEnum,
  SliderModal
} from '@pksep/yui';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  useTemplateRef,
  watch
} from 'vue';
import { getAuthUser } from '../composables/useAuth';
import { useBackButton } from '../composables/useBackButton';
import { openForwardDraft } from '../composables/useForwardMessages';
import { navigateToSearchResult } from '../composables/useMessageSearch';
import { deleteMessageChat } from '../services/useChat';
import {
  fetchMessagesForTopic,
  getFullMessagesByTopicId,
  getMessagesByTopicId
} from '../services/useMessages';
import { ensureMediaObjectUrl } from '../services/useMediaBlobCache';
import {
  downloadNativeFile,
  getNativeFileDownloadState,
  handleNativeFileClick,
  isNativeFileDownloadSupported,
  isNativePdfMedia,
  openNativeFile,
  refreshNativeFileDownloadStatus
} from '../services/useNativeFile';
import { getFormatFileSize, getShortName } from '../utils/getFormatFileSize';
import { VIDEO_FALLBACK_THUMBNAIL } from '../utils/mediaPreview';
import type { IMessage, IMedia, ITopic } from './interfaces/interfaces';
import ContextMenu from './ContactList/ContextMenu.vue';
import { useMessageMedia } from './Messages/composables/useMessageMedia';
import ForwardModal from './Messages/ForwardModal.vue';
import ConfirmModal from './UI/ConfirmModal.vue';
import FileIcon from './UI/FileIcon.vue';
import ForwardIcon from './UI/ForwardIcon.vue';
import PlayIcon from './UI/PlayIcon.vue';

type ProfileAttachmentsTab = 'media' | 'files';

interface ProfileAttachmentsPanelProps {
  topicId?: string | null;
  activeTab?: ProfileAttachmentsTab;
  showTabs?: boolean;
  dataTestid?: string;
}

type ProfileAttachmentItem = {
  key: string;
  media: IMedia;
  message: IMessage;
  messageIndex: number;
  mediaIndex: number;
};

type AttachmentScrollAnchor = {
  key: string | null;
  offsetTop: number | null;
  scrollTop: number;
};

const props = withDefaults(defineProps<ProfileAttachmentsPanelProps>(), {
  activeTab: undefined,
  showTabs: true,
  dataTestid: 'ProfileAttachmentsPanel'
});

const emits = defineEmits<{
  (event: 'show-in-chat'): void;
}>();

const HISTORY_PAGE_LIMIT = 50;
const ATTACHMENTS_BATCH_SIZE = 10;
const MAX_HISTORY_PAGES_PER_BATCH = 10;
const LONG_PRESS_DELAY_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
const SUPPRESS_CLICK_AFTER_LONG_PRESS_MS = 700;
const FILE_DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
});
const FILE_TIME_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit'
});
const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  month: 'long',
  year: 'numeric'
});

const tabs: Array<{ label: string; value: ProfileAttachmentsTab }> = [
  { label: 'Медиа', value: 'media' },
  { label: 'Файлы', value: 'files' }
];

const localActiveTab = ref<ProfileAttachmentsTab>('media');
const sliderElements = ref<{ path: string; name: string; file?: File }[]>([]);
const defaultIndexSlider = ref<number>(0);
const isHistoryLoading = ref(false);
const hasMoreHistory = ref(true);
const contextMenuItem = ref<ProfileAttachmentItem | null>(null);
const isContextMenuOpen = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const deleteModalOpen = ref(false);
const forwardModalOpen = ref(false);
const requestedPageKeys = new Set<string>();
const videoDurationLabels = reactive<Record<string, string>>({});
const loadMoreTriggerRef = useTemplateRef('loadMoreTriggerRef');
const attachmentsRootRef = useTemplateRef('attachmentsRootRef');
const isInsideNativeDialog = ref(false);
const scrollMonthLabel = ref('');
const scrollMonthPosition = ref({ left: '0px', top: '0px' });
let loadMoreObserver: IntersectionObserver | null = null;
let attachmentsScrollContainer: HTMLElement | Window | null = null;
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let longPressPointerId: number | null = null;
let longPressStartPoint = { x: 0, y: 0 };
let suppressAttachmentClickUntil = 0;
const pendingVideoDurationKeys = new Set<string>();
const videoMetadataElements = new Map<string, HTMLVideoElement>();

const { addHandler: addBackHandler, removeHandler: removeBackHandler } =
  useBackButton();
const { getFullMediaPath, isSliderContentUrl, primeMediaCache } =
  useMessageMedia();

const currentTab = computed(() => props.activeTab || localActiveTab.value);
const authUserId = computed(() => getAuthUser()?.id || '');

const setActiveTab = (tab: ProfileAttachmentsTab): void => {
  localActiveTab.value = tab;
};

const isOutgoingMessage = (message: IMessage): boolean =>
  Boolean(authUserId.value && message.senderUserId === authUserId.value);

const canDeleteContextMessage = computed(() =>
  contextMenuItem.value
    ? isOutgoingMessage(contextMenuItem.value.message)
    : false
);

const hideAttachmentContextMenu = (): void => {
  isContextMenuOpen.value = false;
};

const closeAttachmentContextMenu = (): void => {
  hideAttachmentContextMenu();
  contextMenuItem.value = null;
};

const showAttachmentContextMenu = (
  item: ProfileAttachmentItem,
  position: { x: number; y: number }
): void => {
  isInsideNativeDialog.value = Boolean(
    attachmentsRootRef.value?.closest('dialog')
  );
  contextMenuItem.value = item;
  contextMenuPosition.value = position;
  isContextMenuOpen.value = true;
};

const openAttachmentContextMenu = (
  item: ProfileAttachmentItem,
  event: MouseEvent
): void => {
  if (event.altKey) {
    return;
  }

  event.preventDefault();

  const target = event.currentTarget;
  const rect =
    target instanceof HTMLElement ? target.getBoundingClientRect() : null;
  const x = event.clientX || (rect ? rect.left + rect.width / 2 : 8);
  const y = event.clientY || (rect ? rect.top + rect.height / 2 : 8);

  showAttachmentContextMenu(item, { x, y });
};

const cancelAttachmentLongPress = (): void => {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  longPressPointerId = null;
};

const startAttachmentLongPress = (
  item: ProfileAttachmentItem,
  event: PointerEvent
): void => {
  if (event.pointerType === 'mouse') {
    return;
  }

  cancelAttachmentLongPress();
  longPressPointerId = event.pointerId;
  longPressStartPoint = { x: event.clientX, y: event.clientY };

  longPressTimer = setTimeout(() => {
    suppressAttachmentClickUntil =
      Date.now() + SUPPRESS_CLICK_AFTER_LONG_PRESS_MS;
    showAttachmentContextMenu(item, longPressStartPoint);
    cancelAttachmentLongPress();
  }, LONG_PRESS_DELAY_MS);
};

const handleAttachmentLongPressMove = (event: PointerEvent): void => {
  if (event.pointerId !== longPressPointerId) {
    return;
  }

  const distance = Math.hypot(
    event.clientX - longPressStartPoint.x,
    event.clientY - longPressStartPoint.y
  );

  if (distance > LONG_PRESS_MOVE_TOLERANCE_PX) {
    cancelAttachmentLongPress();
  }
};

const handleAttachmentClick = (
  items: ProfileAttachmentItem[],
  index: number,
  event: MouseEvent
): void => {
  if (Date.now() < suppressAttachmentClickUntil) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  void openSlider(
    items.map(({ media }) => media),
    index
  );
};

const handleShowInChat = (): void => {
  const item = contextMenuItem.value;

  if (!item?.message.id || !item.message.topicId) {
    closeAttachmentContextMenu();
    return;
  }

  navigateToSearchResult({
    id: `profile-attachment:${item.message.id}:${Date.now()}`,
    topicId: item.message.topicId,
    message: item.message,
    previewText: item.media.originName || item.message.text || '',
    createdAt: item.message.createdAt
  });
  closeAttachmentContextMenu();
  emits('show-in-chat');
};

const handleOpenForwardModal = (): void => {
  if (!contextMenuItem.value) {
    return;
  }

  hideAttachmentContextMenu();
  forwardModalOpen.value = true;
};

const handleCloseForwardModal = (): void => {
  forwardModalOpen.value = false;
  contextMenuItem.value = null;
};

const handleForwardMessage = (topic: ITopic): void => {
  const message = contextMenuItem.value?.message;

  if (message) {
    openForwardDraft(topic, message);
  }

  handleCloseForwardModal();
};

const handleOpenDeleteModal = (): void => {
  if (!canDeleteContextMessage.value) {
    return;
  }

  hideAttachmentContextMenu();
  deleteModalOpen.value = true;
};

const handleCloseDeleteModal = (): void => {
  deleteModalOpen.value = false;
  contextMenuItem.value = null;
};

const handleDeleteMessage = async (): Promise<void> => {
  const message = contextMenuItem.value?.message;

  if (!message?.id || !message.topicId || !isOutgoingMessage(message)) {
    handleCloseDeleteModal();
    return;
  }

  await deleteMessageChat({
    messageId: message.id,
    topicId: message.topicId
  });
  handleCloseDeleteModal();
};

const getMessageTime = (message: IMessage): number => {
  const value = message.createdAt || message.updatedAt;

  if (value instanceof Date) {
    return value.getTime();
  }

  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const getMessageDate = (message: IMessage): Date | null => {
  const timestamp = getMessageTime(message);

  return timestamp > 0 ? new Date(timestamp) : null;
};

const getFileDateTime = (message: IMessage): string => {
  const date = getMessageDate(message);

  if (!date) {
    return '';
  }

  return `${FILE_DATE_FORMATTER.format(date)} ${FILE_TIME_FORMATTER.format(date)}`;
};

const getFileDateTimeAttribute = (message: IMessage): string =>
  getMessageDate(message)?.toISOString() || '';

const getMonthYearLabel = (message: IMessage): string => {
  const date = getMessageDate(message);

  if (!date) {
    return '';
  }

  const parts = MONTH_YEAR_FORMATTER.formatToParts(date);
  const month = parts.find(part => part.type === 'month')?.value || '';
  const year = parts.find(part => part.type === 'year')?.value || '';
  const normalizedMonth = month
    ? `${month.charAt(0).toUpperCase()}${month.slice(1)}`
    : '';

  return [normalizedMonth, year].filter(Boolean).join(' ');
};

const getScrollableAncestor = (element: HTMLElement): HTMLElement | Window => {
  let current = element.parentElement;

  while (current) {
    const { overflowY } = window.getComputedStyle(current);

    if (/(auto|scroll)/.test(overflowY)) {
      return current;
    }

    current = current.parentElement;
  }

  return window;
};

const getAttachmentScrollTop = (container: HTMLElement | Window): number =>
  container instanceof Window ? window.scrollY : container.scrollTop;

const setAttachmentScrollTop = (
  container: HTMLElement | Window,
  scrollTop: number
): void => {
  const nextScrollTop = Math.max(0, scrollTop);

  if (container instanceof Window) {
    window.scrollTo(0, nextScrollTop);
    return;
  }

  container.scrollTop = nextScrollTop;
};

const getAttachmentScrollViewport = (
  container: HTMLElement | Window
): { top: number; bottom: number } =>
  container instanceof Window
    ? { top: 0, bottom: window.innerHeight }
    : container.getBoundingClientRect();

const getRenderedAttachmentElements = (): HTMLElement[] => {
  const root = attachmentsRootRef.value;

  return root
    ? Array.from(root.querySelectorAll<HTMLElement>('[data-attachment-key]'))
    : [];
};

const captureAttachmentScrollAnchor = (): AttachmentScrollAnchor | null => {
  const container = attachmentsScrollContainer;

  if (!container) {
    return null;
  }

  const viewport = getAttachmentScrollViewport(container);
  const visibleItem = getRenderedAttachmentElements().find(element => {
    const rect = element.getBoundingClientRect();
    return rect.bottom > viewport.top && rect.top < viewport.bottom;
  });

  return {
    key: visibleItem?.dataset.attachmentKey || null,
    offsetTop: visibleItem
      ? visibleItem.getBoundingClientRect().top - viewport.top
      : null,
    scrollTop: getAttachmentScrollTop(container)
  };
};

const restoreAttachmentScrollAnchor = (
  anchor: AttachmentScrollAnchor | null
): void => {
  const container = attachmentsScrollContainer;

  if (!anchor || !container) {
    return;
  }

  const viewport = getAttachmentScrollViewport(container);
  const anchoredItem = anchor.key
    ? getRenderedAttachmentElements().find(
        element => element.dataset.attachmentKey === anchor.key
      )
    : null;

  if (anchoredItem && anchor.offsetTop !== null) {
    const currentOffsetTop =
      anchoredItem.getBoundingClientRect().top - viewport.top;
    const offsetDelta = currentOffsetTop - anchor.offsetTop;

    setAttachmentScrollTop(
      container,
      getAttachmentScrollTop(container) + offsetDelta
    );
    return;
  }

  setAttachmentScrollTop(container, anchor.scrollTop);
};

const updateScrollingMonth = (): void => {
  const root = attachmentsRootRef.value;

  if (!root || !attachmentsScrollContainer) {
    scrollMonthLabel.value = '';
    return;
  }

  const rootRect = root.getBoundingClientRect();
  const containerRect =
    attachmentsScrollContainer instanceof Window
      ? { top: 0, bottom: window.innerHeight }
      : attachmentsScrollContainer.getBoundingClientRect();
  const boundaryTop = Math.max(0, containerRect.top);
  const boundaryBottom = Math.min(window.innerHeight, containerRect.bottom);

  if (
    rootRect.top >= boundaryTop ||
    rootRect.bottom <= boundaryTop ||
    boundaryBottom <= boundaryTop
  ) {
    scrollMonthLabel.value = '';
    return;
  }

  const targetY = boundaryTop + 8;
  const visibleItem = Array.from(
    root.querySelectorAll<HTMLElement>('[data-attachment-month]')
  ).find(element => {
    const rect = element.getBoundingClientRect();
    return rect.bottom > targetY && rect.top < boundaryBottom;
  });
  const label = visibleItem?.dataset.attachmentMonth || '';

  if (!label) {
    scrollMonthLabel.value = '';
    return;
  }

  scrollMonthLabel.value = label;
  scrollMonthPosition.value = {
    left: `${rootRect.left + rootRect.width / 2}px`,
    top: `${boundaryTop + 8}px`
  };
};

let scrollMonthFrameId: number | null = null;

const scheduleScrollingMonthUpdate = (): void => {
  if (scrollMonthFrameId !== null) {
    return;
  }

  scrollMonthFrameId = window.requestAnimationFrame(() => {
    scrollMonthFrameId = null;
    updateScrollingMonth();
  });
};

const teardownScrollingMonth = (): void => {
  attachmentsScrollContainer?.removeEventListener(
    'scroll',
    scheduleScrollingMonthUpdate
  );
  window.removeEventListener('resize', scheduleScrollingMonthUpdate);
  attachmentsScrollContainer = null;
  scrollMonthLabel.value = '';

  if (scrollMonthFrameId !== null) {
    window.cancelAnimationFrame(scrollMonthFrameId);
    scrollMonthFrameId = null;
  }
};

const setupScrollingMonth = (): void => {
  teardownScrollingMonth();

  const root = attachmentsRootRef.value;

  if (!root) {
    return;
  }

  attachmentsScrollContainer = getScrollableAncestor(root);
  attachmentsScrollContainer.addEventListener(
    'scroll',
    scheduleScrollingMonthUpdate,
    { passive: true }
  );
  window.addEventListener('resize', scheduleScrollingMonthUpdate, {
    passive: true
  });
  scheduleScrollingMonthUpdate();
};

const topicMessages = computed(() => {
  const topicId = props.topicId;

  if (!topicId) {
    return [];
  }

  const fullMessages = getFullMessagesByTopicId(topicId);
  const visibleMessages = getMessagesByTopicId(topicId);
  const messagesById = new Map<string, IMessage>();

  [...fullMessages, ...visibleMessages].forEach((message, index) => {
    const key = message.id || `${index}`;

    if (!messagesById.has(key)) {
      messagesById.set(key, message);
    }
  });

  return Array.from(messagesById.values()).sort(
    (left, right) => getMessageTime(left) - getMessageTime(right)
  );
});

const oldestMessageId = computed(() => topicMessages.value[0]?.id || '');

const isReadyMedia = (media: IMedia): boolean =>
  Boolean(
    !media.isLoading &&
      !media.uploadError &&
      (media.path || media.localPath || media.localThumbnailPath)
  );

const attachmentItems = computed<ProfileAttachmentItem[]>(() =>
  topicMessages.value
    .flatMap((message, messageIndex) =>
      (message.media || []).filter(isReadyMedia).map((media, mediaIndex) => ({
        key: [
          message.id || messageIndex,
          media.id || media.path || mediaIndex
        ].join(':'),
        media,
        message,
        messageIndex,
        mediaIndex
      }))
    )
    .sort((left, right) => {
      const timeDiff =
        getMessageTime(right.message) - getMessageTime(left.message);

      if (timeDiff !== 0) {
        return timeDiff;
      }

      if (right.messageIndex !== left.messageIndex) {
        return right.messageIndex - left.messageIndex;
      }

      return left.mediaIndex - right.mediaIndex;
    })
);

const mediaItems = computed(() =>
  attachmentItems.value.filter(item => item.media.type !== MediaType.File)
);

const fileItems = computed(() =>
  attachmentItems.value.filter(item => item.media.type === MediaType.File)
);

const activeItems = computed(() =>
  currentTab.value === 'media' ? mediaItems.value : fileItems.value
);

const isCurrentTabEmpty = computed(() => activeItems.value.length === 0);

const emptyLabel = computed(() =>
  currentTab.value === 'media' ? 'Нет медиа' : 'Нет файлов'
);

const visibleMediaIdentity = computed(() =>
  mediaItems.value
    .map(item => `${item.media.id || ''}:${item.media.path || ''}`)
    .join('\u001f')
);

const nativeFileStatusIdentity = computed(() =>
  fileItems.value
    .map(
      ({ media }) =>
        `${media.id || ''}:${media.path || ''}:${media.isLoading ? 1 : 0}:${media.uploadError ? 1 : 0}`
    )
    .join('\u001f')
);

const getVideoDurationKey = (media: IMedia): string =>
  media.id || media.path || media.localPath || media.originName;

const formatVideoDuration = (durationSeconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(durationSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const getVideoDurationFromMedia = (media: IMedia): number | null => {
  const metadata = media.ex as
    | (typeof media.ex & { duration?: number; durationSec?: number })
    | undefined;
  const duration = metadata?.durationSec ?? metadata?.duration;

  return typeof duration === 'number' &&
    Number.isFinite(duration) &&
    duration > 0
    ? duration
    : null;
};

const clearVideoMetadataElement = (key: string): void => {
  const video = videoMetadataElements.get(key);

  if (video) {
    video.removeAttribute('src');
    video.load();
    videoMetadataElements.delete(key);
  }

  pendingVideoDurationKeys.delete(key);
};

const loadVideoDuration = (media: IMedia): void => {
  if (media.type !== MediaType.Video) {
    return;
  }

  const key = getVideoDurationKey(media);

  if (!key || videoDurationLabels[key] || pendingVideoDurationKeys.has(key)) {
    return;
  }

  const metadataDuration = getVideoDurationFromMedia(media);

  if (metadataDuration) {
    videoDurationLabels[key] = formatVideoDuration(metadataDuration);
    return;
  }

  const source = getFullMediaPath(media, false);

  if (!source) {
    return;
  }

  const video = document.createElement('video');
  pendingVideoDurationKeys.add(key);
  videoMetadataElements.set(key, video);
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.addEventListener(
    'loadedmetadata',
    () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        videoDurationLabels[key] = formatVideoDuration(video.duration);
      }

      clearVideoMetadataElement(key);
    },
    { once: true }
  );
  video.addEventListener('error', () => clearVideoMetadataElement(key), {
    once: true
  });
  video.src = source;
  video.load();
};

const getVideoDurationLabel = (media: IMedia): string =>
  media.type === MediaType.Video
    ? videoDurationLabels[getVideoDurationKey(media)] || ''
    : '';

const resetHistoryPagination = (): void => {
  requestedPageKeys.clear();
  hasMoreHistory.value = true;
  isHistoryLoading.value = false;
};

const loadNextHistoryPage = async (): Promise<void> => {
  const topicId = props.topicId;

  if (!topicId || isHistoryLoading.value || !hasMoreHistory.value) {
    return;
  }

  const requestedTab = currentTab.value;
  const getRequestedItemsCount = (): number =>
    requestedTab === 'media' ? mediaItems.value.length : fileItems.value.length;
  const targetItemsCount = getRequestedItemsCount() + ATTACHMENTS_BATCH_SIZE;
  let loadedPages = 0;

  isHistoryLoading.value = true;

  try {
    while (
      props.topicId === topicId &&
      hasMoreHistory.value &&
      getRequestedItemsCount() < targetItemsCount &&
      loadedPages < MAX_HISTORY_PAGES_PER_BATCH
    ) {
      const cursor = oldestMessageId.value;
      const requestKey = cursor || 'latest';

      if (requestedPageKeys.has(requestKey)) {
        break;
      }

      requestedPageKeys.add(requestKey);
      const scrollAnchor =
        currentTab.value === requestedTab
          ? captureAttachmentScrollAnchor()
          : null;
      let messages: IMessage[];

      try {
        messages = await fetchMessagesForTopic(topicId, {
          limit: HISTORY_PAGE_LIMIT,
          lastMessageId: cursor || undefined,
          forceRefresh: true,
          forceNetwork: true,
          updateVisible: false,
          syncLastMessage: false,
          allowStaleFallback: false
        });
      } catch (error) {
        requestedPageKeys.delete(requestKey);
        throw error;
      }

      loadedPages += 1;
      await nextTick();

      if (currentTab.value === requestedTab) {
        restoreAttachmentScrollAnchor(scrollAnchor);
        scheduleScrollingMonthUpdate();
      }

      const nextCursor = oldestMessageId.value;

      if (
        messages.length < HISTORY_PAGE_LIMIT ||
        !nextCursor ||
        nextCursor === cursor
      ) {
        hasMoreHistory.value = false;
      }
    }
  } catch (error) {
    console.warn('Failed to fetch profile attachments history:', error);
  } finally {
    isHistoryLoading.value = false;
  }
};

const ensureActiveTabHasRequestedData = (): void => {
  if (!props.topicId || activeItems.value.length > 0) {
    return;
  }

  void loadNextHistoryPage();
};

const setupLoadMoreObserver = (): void => {
  loadMoreObserver?.disconnect();
  loadMoreObserver = null;

  if (
    !loadMoreTriggerRef.value ||
    typeof IntersectionObserver === 'undefined'
  ) {
    return;
  }

  loadMoreObserver = new IntersectionObserver(
    entries => {
      if (!entries.some(entry => entry.isIntersecting)) {
        return;
      }

      void loadNextHistoryPage();
    },
    {
      root: null,
      rootMargin: '240px 0px'
    }
  );
  loadMoreObserver.observe(loadMoreTriggerRef.value);
};

watch(
  () => props.topicId,
  () => {
    cancelAttachmentLongPress();
    closeAttachmentContextMenu();
    deleteModalOpen.value = false;
    forwardModalOpen.value = false;
    resetHistoryPagination();
    void nextTick().then(() => {
      setupLoadMoreObserver();
      ensureActiveTabHasRequestedData();
    });
  },
  { immediate: true }
);

watch(
  currentTab,
  () => {
    ensureActiveTabHasRequestedData();
  },
  { immediate: true }
);

watch(
  () => [hasMoreHistory.value, isHistoryLoading.value],
  () => {
    void nextTick().then(setupLoadMoreObserver);
  }
);

watch(
  visibleMediaIdentity,
  () => {
    mediaItems.value.forEach(item => {
      primeMediaCache(item.media);
      loadVideoDuration(item.media);
    });

    void nextTick().then(scheduleScrollingMonthUpdate);
  },
  { immediate: true }
);

watch(
  [currentTab, nativeFileStatusIdentity],
  () => {
    void nextTick().then(scheduleScrollingMonthUpdate);
  },
  { immediate: true }
);

watch(
  () => sliderElements.value.length > 0,
  isOpen => {
    if (isOpen) {
      addBackHandler(closeSlider);
      return;
    }

    removeBackHandler(closeSlider);
  }
);

onMounted(() => {
  isInsideNativeDialog.value = Boolean(
    attachmentsRootRef.value?.closest('dialog')
  );
  setupLoadMoreObserver();
  setupScrollingMonth();
});

onBeforeUnmount(() => {
  cancelAttachmentLongPress();
  teardownScrollingMonth();
  Array.from(videoMetadataElements.keys()).forEach(clearVideoMetadataElement);
  loadMoreObserver?.disconnect();
  loadMoreObserver = null;
  removeBackHandler(closeSlider);
});

const closeSlider = (): void => {
  sliderElements.value = [];
};

const isAndroidNativePlatform = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

const getSliderDetectionValue = (media: IMedia): string =>
  media.originName || media.path || '';

const isSliderContentMedia = (media: IMedia): boolean =>
  media.type === MediaType.Image ||
  media.type === MediaType.Video ||
  isSliderContentUrl(getSliderDetectionValue(media), {
    includePdf: !isAndroidNativePlatform()
  });

const shouldUseNativeFileState = (media: IMedia): boolean =>
  Boolean(
    isNativeFileDownloadSupported() &&
      media.path &&
      !media.isLoading &&
      !media.uploadError &&
      !isSliderContentMedia(media)
  );

const isNativeFileDownloading = (media: IMedia): boolean =>
  shouldUseNativeFileState(media) &&
  getNativeFileDownloadState(media).phase === 'downloading';

const isFileIconLoaded = (media: IMedia): boolean =>
  !media.isLoading && !isNativeFileDownloading(media);

const getFileIconPercent = (media: IMedia): number | null => {
  if (isNativeFileDownloading(media)) {
    return getNativeFileDownloadState(media).percent;
  }

  return media.isLoading ? media.uploadPercent ?? null : null;
};

const getFileIconType = (media: IMedia): 'file' | 'download' => {
  if (!shouldUseNativeFileState(media)) {
    return 'file';
  }

  return getNativeFileDownloadState(media).phase === 'downloaded'
    ? 'file'
    : 'download';
};

const syncNativeFileStatuses = (): void => {
  if (!isNativeFileDownloadSupported()) {
    return;
  }

  fileItems.value.forEach(({ media }) => {
    if (!shouldUseNativeFileState(media)) {
      return;
    }

    void refreshNativeFileDownloadStatus(media);
  });
};

watch(nativeFileStatusIdentity, syncNativeFileStatuses, { immediate: true });

const buildSliderItem = async (media: IMedia) => {
  const fallbackPath = getFullMediaPath(media, false);

  if (!isNativePdfMedia(media) || !media.path) {
    return {
      path: fallbackPath,
      name: media.originName || 'file'
    };
  }

  const cachedObjectUrl = await ensureMediaObjectUrl(media.path);

  if (!cachedObjectUrl) {
    return {
      path: fallbackPath,
      name: media.originName || 'file'
    };
  }

  try {
    const blob = await fetch(cachedObjectUrl).then(response => response.blob());
    const file = new File([blob], media.originName || 'file.pdf', {
      type: blob.type || 'application/pdf'
    });

    return {
      path: cachedObjectUrl,
      name: media.originName || 'file',
      file
    };
  } catch {
    return {
      path: cachedObjectUrl,
      name: media.originName || 'file'
    };
  }
};

const downloadMediaFile = async (media: IMedia): Promise<void> => {
  if (await downloadNativeFile(media)) {
    return;
  }

  const fallbackUrl = getFullMediaPath(media, false);
  const cachedObjectUrl = media.path
    ? await ensureMediaObjectUrl(media.path)
    : '';
  const link = document.createElement('a');

  link.href = cachedObjectUrl || fallbackUrl;
  link.download = media.originName || 'file';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const openSlider = async (
  medias: IMedia[],
  defaultIndex: number = 0
): Promise<void> => {
  const selectedMedia = medias[defaultIndex];

  if (!selectedMedia) {
    return;
  }

  if (
    selectedMedia.type === MediaType.File &&
    !isSliderContentMedia(selectedMedia) &&
    isAndroidNativePlatform()
  ) {
    if (await handleNativeFileClick(selectedMedia)) {
      return;
    }
  }

  if (
    selectedMedia.type === MediaType.File &&
    !isSliderContentMedia(selectedMedia) &&
    isNativePdfMedia(selectedMedia) &&
    isAndroidNativePlatform()
  ) {
    try {
      if (await openNativeFile(selectedMedia)) {
        return;
      }
    } catch {
      // Fall back to download when native PDF opening is not available.
    }

    await downloadMediaFile(selectedMedia);
    return;
  }

  if (
    selectedMedia.type === MediaType.File &&
    !isSliderContentMedia(selectedMedia) &&
    isNativePdfMedia(selectedMedia)
  ) {
    if (await openNativeFile(selectedMedia)) {
      return;
    }
  }

  if (
    selectedMedia.type === MediaType.File &&
    !isSliderContentMedia(selectedMedia)
  ) {
    await downloadMediaFile(selectedMedia);
    return;
  }

  const sliderMedias = medias.filter(isSliderContentMedia);

  sliderElements.value = await Promise.all(
    sliderMedias.map(media => buildSliderItem(media))
  );

  const correctedIndex = sliderMedias.findIndex(
    media => media === selectedMedia
  );

  defaultIndexSlider.value = correctedIndex !== -1 ? correctedIndex : 0;
};

const getMediaPreviewPath = (media: IMedia): string => {
  if (media.type === MediaType.Video && !media.thumbnailPath) {
    return media.localThumbnailPath || VIDEO_FALLBACK_THUMBNAIL;
  }

  return getFullMediaPath(media);
};

const getMediaLabel = (media: IMedia): string =>
  media.originName || (media.type === MediaType.Video ? 'Видео' : 'Медиа');
</script>

<style scoped>
.profile-attachments {
  display: grid;
  width: 100%;
  gap: 15px;
}

.profile-attachments__tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.profile-attachments__tab {
  min-width: 0;
  min-height: 33px;
  padding: 0 10px;
  border: 1px solid var(--border-grey);
  border-radius: 17px;
  background: var(--white);
  color: var(--text-color);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.profile-attachments__tab--active {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.profile-attachments__media-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 3px;
}

.profile-attachments__media-tile {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  overflow: hidden;
  background: var(--grey2);
  cursor: pointer;
  touch-action: pan-y;
  -webkit-touch-callout: none;
}

.profile-attachments__media-tile img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
}

.profile-attachments__media-play {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgb(0 0 0 / 8%);
  pointer-events: none;
}

.profile-attachments__media-duration {
  position: absolute;
  right: 5px;
  bottom: 4px;
  z-index: 1;
  color: var(--white);
  font-size: 10px;
  font-weight: 500;
  line-height: 12px;
  text-shadow: 0 1px 3px rgb(0 0 0 / 65%);
  pointer-events: none;
}

.profile-attachments__file-list {
  display: grid;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.profile-attachments__file-item {
  min-width: 0;
}

.profile-attachments__file-button {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  align-items: center;
  gap: 15px;
  width: 100%;
  min-height: 60px;
  padding: 10px 15px;
  border: 0;
  border-radius: 20px;
  background: var(--white);
  box-shadow: inset 0 0 0 1px var(--blue1);
  color: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: pan-y;
  -webkit-touch-callout: none;
}

.profile-attachments__file-button--outgoing {
  background: var(--blue12);
  box-shadow: none;
}

.profile-attachments__file-button:focus-visible {
  box-shadow: inset 0 0 0 2px var(--blue1);
}

.profile-attachments__file-icon {
  width: 40px;
  height: 40px;
}

.profile-attachments__file-copy {
  display: grid;
  min-width: 0;
}

.profile-attachments__file-name {
  min-width: 0;
  overflow: hidden;
  color: var(--text-black);
  font-size: 16px;
  font-weight: 400;
  line-height: 19px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-attachments__file-properties {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  min-height: 15px;
}

.profile-attachments__file-size {
  color: var(--text-grey);
  font-size: 12px;
  line-height: 15px;
}

.profile-attachments__file-date {
  color: var(--neutral-text-light);
  font-size: 12px;
  line-height: 15px;
  white-space: nowrap;
}

.profile-attachments__empty,
.profile-attachments__load-more {
  min-height: 28px;
  margin: 6px 0 0;
  color: var(--text-grey);
  font-size: 14px;
  line-height: 18px;
  text-align: center;
}

.profile-attachments__context-menu {
  z-index: 2100;
  min-width: 190px;
}

.profile-attachments__scroll-month {
  position: fixed;
  z-index: 999;
  padding: 4px 10px;
  border: 1px solid var(--border-grey);
  border-radius: 12px;
  background: rgb(255 255 255 / 92%);
  box-shadow: 0 2px 8px rgb(0 0 0 / 8%);
  color: var(--text-grey);
  font-size: 12px;
  line-height: 15px;
  white-space: nowrap;
  transform: translateX(-50%);
  pointer-events: none;
}
</style>
