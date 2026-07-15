<template>
  <ul
    :key="listRenderKey"
    :class="['contact-list', props.class]"
    role="list"
    :data-testid="`${props.dataTestid}-ContactList-List`"
    :aria-label="`${props.dataTestid} Contact List`"
  >
    <li
      v-if="showContactSectionTitle"
      class="contact-list__section-title"
      :data-testid="`${props.dataTestid}-ContactList-ContactsTitle`"
    >
      Контакты
    </li>
    <li
      v-for="(topic, index) in props.topics"
      :key="topic.id"
      class="contact-list__li"
      role="listitem"
      tabindex="0"
      @keydown="event => handleKeyDown(topic, index, event)"
      :data-testid="`${props.dataTestid}-ContactList-Item${index + 1}`"
    >
      <div
        :class="[
          'contact-list__item',
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
        <component
          :is="isBotTopic(topic) ? BotAvatar : CachedAvatar"
          :class="[
            'contact-list__avatar',
            {
              'contact-list__avatar--interactive':
                !props.showCheckbox && topic.type === TopicType.DM
            }
          ]"
          :initials="topic.name"
          :path="getTopicAvatarPath(topic)"
          :alt="`Avatar of ${topic.name}`"
          :data-testid="`${props.dataTestid}-ContactList-Avatar${index + 1}`"
          is-icon
          :is-online="isTopicUserOnline(topic)"
        />
        <div
          :class="[
            'contact-list__block--wrapper',
            {
              'contact-list__block--wrapper--selection': props.showCheckbox
            }
          ]"
        >
          <h5
            role="heading"
            aria-level="5"
            class="contact-list__title"
            :data-testid="`${props.dataTestid}-ContactList-Title${index + 1}`"
          >
            <span class="contact-list__title-text">{{ topic.name }}</span>
            <Tooltip
              v-if="getTopicStatusIcon(topic) && getTopicStatusLabel(topic)"
              :hint="getTopicStatusLabel(topic)"
              position="top-center"
              type="black"
              size="small"
              :data-testid="`${props.dataTestid}-ContactList-StatusTooltip${index + 1}`"
            >
              <EmojiIcon
                class="contact-list__title-status"
                :emoji="getTopicStatusIcon(topic)"
                @click.stop
              />
            </Tooltip>

            <div
              v-if="getTopicActiveCall(topic)"
              class="contact-list__call-indicator"
              :data-testid="`${props.dataTestid}-ContactList-Call${index + 1}`"
              :aria-label="`Active call in ${topic.name}`"
            >
              <LeaveIcon class="contact-list__call-indicator-icon" />
              <span class="contact-list__time contact-list__time--call">
                {{ getTopicActiveCallTime(topic) }}
              </span>
            </div>
          </h5>
          <div
            v-if="topic.typingUserIds?.length"
            class="contact-list__description contact-list__description--typing"
            :data-testid="`${props.dataTestid}-ContactList-Typing${index + 1}`"
          >
            <TypingIndicator :label="getTopicTypingLabel(topic)" />
          </div>
          <div
            v-else-if="!!topic.lastMessage?.text"
            class="contact-list__description"
            v-emoji
            :data-testid="`${props.dataTestid}-ContactList-Description${index + 1}`"
            :aria-label="`Latest message: ${stripHtml(topic.lastMessage?.text || 'No message')}`"
          >
            {{ stripHtml(topic.lastMessage?.text) }}
          </div>
          <div
            v-else-if="
              topic.lastMessage?.media?.length > 0 &&
              topic.lastMessage.media[0].type === MediaType.File
            "
            class="contact-list__description contact-list__description__media"
          >
            <AttachFileIcon />
            <p>Медиа</p>
          </div>
          <div
            v-else-if="topic.lastMessage?.media?.length > 0"
            class="contact-list__description contact-list__description__media"
            :data-testid="`${props.dataTestid}-ContactList-Media${index + 1}`"
          >
            <template
              v-for="media in topic.lastMessage.media.slice(0, 3)"
              :key="media.id"
              ><div>
                <img
                  v-if="media.type !== MediaType.File"
                  :src="getFullMediaPath(media)"
                />

                <MiniPlayIcon
                  v-if="media.type === MediaType.Video"
                  class="contact-list__description__media__play"
                />
              </div>
            </template>

            <p>{{ getTopicLastMessageLabel(topic.lastMessage?.media) }}</p>
          </div>
          <div v-if="!props.showCheckbox" class="contact-list__top">
            <MessageStatusIcons
              v-if="
                topic.lastMessage?.senderUserId === authedUser?.id &&
                !topic.lastMessage?.isSystem
              "
              :class="{
                'contact-list__message-status-icons': true,
                'is-read': topic.lastMessage?.status === MessageStatusEnum.READ
              }"
              :message-status="topic.lastMessage?.status"
              :is-read="topic.lastMessage?.status === MessageStatusEnum.READ"
              :is-me-sender="true"
              :data-testid="`${props.dataTestid}-ContactList-MessageStatusIcons${index + 1}`"
            />
            <span
              v-if="topic.lastMessage?.createdAt"
              class="contact-list__time"
              :data-testid="`${props.dataTestid}-ContactList-Time${index + 1}`"
              :aria-label="`Last message at ${formatListTime(new Date(topic.lastMessage?.createdAt))}`"
            >
              {{ formatListTime(new Date(topic.lastMessage?.createdAt)) }}
            </span>
          </div>
          <div v-if="!props.showCheckbox" class="contact-list__bottom">
            <div
              v-if="
                topic.hasUnreadReaction &&
                getTopicUnreadReactionMessageId(topic.id)
              "
              class="contact-list__reaction-indicator"
              :data-testid="`${props.dataTestid}-ContactList-Reaction${index + 1}`"
              role="button"
              tabindex="0"
              aria-label="Новая реакция на ваше сообщение"
              @click.stop="event => handleReactionClick(topic, index, event)"
              @keydown.enter.stop="
                event => handleReactionClick(topic, index, event)
              "
              @keydown.space.stop.prevent="
                event => handleReactionClick(topic, index, event)
              "
            >
              <ReactionHeartIcon />
            </div>
            <div
              v-if="topic.taggedMe"
              class="contact-list__notification contact-list__mention"
              :data-testid="`${props.dataTestid}-ContactList-Mention${index + 1}`"
            >
              @
            </div>
            <div
              v-if="hasTopicUnreadIndicator(topic, authedUser?.id)"
              :class="{
                'contact-list__notification': true,
                'contact-list__notification--muted': topic.info?.isMute
              }"
              :data-testid="`${props.dataTestid}-ContactList-Notification${index + 1}`"
              :aria-label="getTopicUnreadIndicatorLabel(topic)"
            >
              <template v-if="getTopicUnreadBadgeCount(topic, authedUser?.id)">
                {{ getTopicUnreadBadgeCount(topic, authedUser?.id) }}
              </template>
            </div>
            <div
              class="contact-list__pin"
              v-if="topic.info?.isPin"
              :data-testid="`${props.dataTestid}-ContactList-Pin${index + 1}`"
              :aria-label="`Pinned contact`"
            >
              <PinIcon v-if="topic.info?.isPin" />
            </div>
          </div>
        </div>
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
      <ContextMenu
        v-if="!props.showCheckbox"
        :visible="!!isOpen[topic.id]"
        :position="position"
        :data-testid="`${props.dataTestid}-ContactList-ContextMenu${index + 1}`"
        @unmount-close="() => closeActivePopover(topic.id)"
      >
        <Button
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          @click.stop="() => handlePin(topic)"
          :data-testid="`${props.dataTestid}-ContactList-PinButton${index + 1}`"
          :aria-label="
            topic.info.isPin ? `Unpin ${topic.name}` : `Pin ${topic.name}`
          "
        >
          <template v-if="!topic.info.isPin"> <PinIcon /> Закрепить </template>
          <template v-else> <UnpinIcon /> Открепить </template>
        </Button>
        <Button
          :type="ButtonTypeEnum.ghost"
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
        <Button
          :type="ButtonTypeEnum.ghost"
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
            <UnmuteIcon /> Вкл. уведомление
          </template>
          <template v-else><MuteIcon /> Выкл. уведомление </template>
        </Button>
      </ContextMenu>
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
      class="contact-list__li"
      role="listitem"
      tabindex="0"
      :data-testid="`${props.dataTestid}-ContactList-MessageResult${index + 1}`"
      @keydown.enter="handleMessageResultClick(result)"
      @keydown.space="handleMessageResultClick(result)"
    >
      <div
        class="contact-list__item contact-list__item--message-result"
        role="button"
        tabindex="0"
        @click="handleMessageResultClick(result)"
      >
        <component
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
      <img
        class="contact-list__search-state-image"
        src="/images/not-found-contact.svg"
        alt="Ничего не найдено"
      />
    </li>
  </ul>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useContextMenu } from '../../composables/useContextMenu';
import {
  Button,
  ButtonTypeEnum,
  Checkbox,
  CheckboxSizeEnum,
  Icon,
  IconNameEnum,
  SizesEnum,
  Tooltip
} from '@pksep/yui';
import ContextMenu from './ContextMenu.vue';
import MessageStatusIcons from '../Messages/MessageStatusIcons.vue';
import CachedAvatar from '../UI/CachedAvatar.vue';
import BotAvatar from '../UI/BotAvatar.vue';
import EmojiIcon from '../UI/EmojiIcon.vue';
import type { IContactListProps } from './interfaces/contact-list';
import { getAuthUser } from '../../composables/useAuth';
import { IMedia, ITopic, MessageStatusEnum } from '../interfaces/interfaces';
import { useTopics } from '../../composables/useTopics';
import { formatListTime } from '../../composables/useTime';
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';
import {
  navigateToDialogs,
  navigateToGroup
} from '../../composables/navigation';
import { MediaType } from '@pksep/zod-shared-chat';
import AttachFileIcon from '../UI/AttachFileIcon.vue';
import MiniPlayIcon from '../UI/MiniPlayIcon.vue';
import { stripHtml } from '../../utils/stripHtml';
import PinIcon from '../UI/PinIcon.vue';
import UnpinIcon from '../UI/UnpinIcon.vue';
import UnmuteIcon from '../UI/UnmuteIcon.vue';
import MuteIcon from '../UI/MuteIcon.vue';
import ReadIcon from '../UI/ReadIcon.vue';
import { TopicType } from '../../services/useChatSDK/types';
import { getUserById, getUserLastOnline } from '../../composables/useUsers';
import { getHasWebsocketConnection, markAsRead } from '../../services/useChat';
import { useMessageMedia } from '../Messages/composables/useMessageMedia';
import TypingIndicator from '../UI/TypingIndicator.vue';
import { getTypingIndicatorLabel } from '../../utils/typingIndicator';
import { formatUserStatusText } from '../../utils/userStatus';
import { preloadNotoEmojiAssets } from '../../composables/useEmojiStyle';
import {
  getTopicUnreadBadgeCount,
  hasTopicUnreadIndicator
} from '../../utils/topicUnreadBadge';
import {
  activeCallFormattedTime,
  activeCallTopicId,
  isCallActive,
  pendingGroupCallInfo
} from '../../services/useCallState';
import LeaveIcon from '../CallModal/UI/LeaveIcon.vue';
import type { IMessageSearchResult } from '../../composables/useMessageSearch';
import { isBotTopic, isDeletedBotUser } from '../../utils/bot';
import ReactionHeartIcon from '../UI/ReactionHeartIcon.vue';
import { requestTopicReactionJump } from '../../services/useTopicViewportState';
import {
  getInteractionTelemetryPayload,
  recordChatTopicNavigationRequest,
  recordChatTopicOpenAttempt,
  type ChatTopicOpenTelemetryMeta
} from '../../services/useChatNavigationTelemetry';

interface IExtendedContactListProps extends IContactListProps {
  showCheckbox?: boolean;
  selectedTopicIds?: Set<string | number>;
  searchQuery?: string;
  toolbarFilter?: string;
  messageResults?: IMessageSearchResult[];
  isMessageSearchLoading?: boolean;
}

const {
  togglePinTopic,
  toggleMuteTopic,
  getTopicTypingUsers,
  setTopicMarkedUnread,
  resetTopicUnreadState,
  getTopicUnreadReactionMessageId
} = useTopics();

const props = withDefaults(defineProps<IExtendedContactListProps>(), {
  showCheckbox: false,
  selectedTopicIds: () => new Set<string | number>(),
  searchQuery: '',
  toolbarFilter: '',
  messageResults: () => [],
  isMessageSearchLoading: false
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

const { state: isMobile } = useResizeState(MAX_W_MD);

const { isOpen, position, openActivePopover, closeActivePopover } =
  useContextMenu();

const authedUser = computed(() => getAuthUser());
const isRecentlyReconnected = computed(() => getHasWebsocketConnection());
const listRenderKey = ref(0);
const pendingActiveTopicId = ref<string | null>(null);
const { getFullMediaPath } = useMessageMedia();
const currentTime = ref(Date.now());
let currentTimeInterval: ReturnType<typeof setInterval> | null = null;
const TOPIC_PRESS_SCROLL_CANCEL_PX = 8;
let topicPressPointerId: number | null = null;
let topicPressStartX = 0;
let topicPressStartY = 0;
let topicPressMoved = false;

const hasSearchQuery = computed(() => props.searchQuery.trim().length > 0);
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
    !props.isMessageSearchLoading &&
    props.topics.length === 0 &&
    props.messageResults.length === 0
);

const isTopicActive = (topic: ITopic): boolean =>
  topic.id === pendingActiveTopicId.value ||
  !!isOpen[topic.id] ||
  props.selectedTopicIds.has(topic.id) ||
  (!isMobile.value && topic.id === props.selectedTopicId);

const getTopicEffectiveUser = (topic: ITopic) =>
  topic.type === TopicType.DM && topic.user?.id
    ? getUserById(topic.user.id) || topic.user
    : topic.user;

const getTopicStatusIcon = (topic: ITopic): string =>
  topic.type === TopicType.DM
    ? getTopicEffectiveUser(topic)?.status?.icon || ''
    : '';

watch(isRecentlyReconnected, value => {
  if (!value) return;
  listRenderKey.value += 1;
});

watch(
  () =>
    props.topics
      .map(topic => getTopicStatusIcon(topic))
      .filter((icon): icon is string => Boolean(icon))
      .join('|'),
  iconsSignature => {
    preloadNotoEmojiAssets(
      iconsSignature ? iconsSignature.split('|').filter(Boolean) : [],
      {
        highPriority: true
      }
    );
  },
  {
    immediate: true
  }
);

onMounted(() => {
  currentTimeInterval = setInterval(() => {
    currentTime.value = Date.now();
  }, 1000);
});

onBeforeUnmount(() => {
  if (currentTimeInterval) {
    clearInterval(currentTimeInterval);
    currentTimeInterval = null;
  }
});

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
    topicType: topic.type,
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
    topicType: topic.type,
    source
  });

  if (topic.type === TopicType.DM) {
    navigateToDialogs(topic.id);
  } else if (topic.type === TopicType.Group) {
    navigateToGroup(topic.id);
  }
};

const navigateToTopicRoute = (topic: ITopic): void => {
  if (topic.type === TopicType.DM) {
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
    topicType: topic.type,
    source: navigationSource
  });

  if (hasTopicUnreadIndicator(topic, authedUser.value?.id)) {
    void markTopicRead(topic);
  } else if (topic.info?.isMarkedUnread) {
    void setTopicMarkedUnread(topic, false);
  }
};

const handleClick = (topic: ITopic, index?: number, event?: Event): void => {
  if (isMobile.value && topicPressMoved && !(event instanceof KeyboardEvent)) {
    pendingActiveTopicId.value = null;
    topicPressMoved = false;
    return;
  }

  if (props.showCheckbox) {
    emits('unmount-topic', topic);
    return;
  }

  if (isMobile.value) {
    emits('unmount-topic', topic, null);
    navigateToTopicRoute(topic);

    window.setTimeout(() => {
      syncTopicOpenSideEffects(
        topic,
        index,
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
    topic,
    index,
    event,
    event instanceof KeyboardEvent ? 'topic_list.keyboard' : 'topic_list.click'
  );

  if (hasTopicUnreadIndicator(topic, authedUser.value?.id)) {
    void markTopicRead(topic);
  } else if (topic.info?.isMarkedUnread) {
    void setTopicMarkedUnread(topic, false);
  }

  emits('unmount-topic', topic, telemetry);
};

const handleTopicPress = (topic: ITopic, event: PointerEvent): void => {
  if (props.showCheckbox || !isMobile.value) {
    return;
  }

  if (event.pointerType === 'mouse' && event.button !== 0) {
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
  if (isDeletedBotUser(topic.user)) {
    return false;
  }

  return (
    isBotTopic(topic) ||
    (topic.type === TopicType.DM &&
      !!topic.user &&
      !getUserLastOnline(topic.user) &&
      getHasWebsocketConnection())
  );
};

const getTopicLastMessageLabel = (media: IMedia[]): string => {
  let text = '';
  const haveImage = media.some(m => m.type === MediaType.Image);
  const haveVideo = media.some(m => m.type === MediaType.Video);
  if (haveImage) {
    text += 'Фото';
  }

  if (haveVideo) {
    if (text) {
      text += ', видео';
    } else {
      text = 'Видео';
    }
  }

  return text;
};

const getTopicTypingLabel = (topic: ITopic): string =>
  getTypingIndicatorLabel(topic.type, getTopicTypingUsers(topic.id));

const getTopicStatusLabel = (topic: ITopic): string =>
  topic.type === TopicType.DM
    ? formatUserStatusText(getTopicEffectiveUser(topic)?.status)
    : '';

const getTopicUnreadIndicatorLabel = (topic: ITopic): string => {
  const unreadCount = getTopicUnreadBadgeCount(topic, authedUser.value?.id);

  return unreadCount > 0
    ? `${unreadCount} new messages`
    : `${topic.name} marked as new`;
};

const getTopicActiveCall = (topic: ITopic) => {
  if (isCallActive.value && activeCallTopicId.value === topic.id) {
    return {
      roomId: topic.activeCall?.roomId || topic.id,
      startTime: topic.activeCall?.startTime ?? null
    };
  }

  return pendingGroupCallInfo.value?.[topic.id] || topic.activeCall || null;
};

const getTopicActiveCallTime = (topic: ITopic): string => {
  if (isCallActive.value && activeCallTopicId.value === topic.id) {
    return activeCallFormattedTime.value;
  }

  const startTime = getTopicActiveCall(topic)?.startTime;
  const elapsedDurationMs = getTopicActiveCall(topic)?.elapsedDurationMs ?? 0;

  if (typeof startTime !== 'number' || !Number.isFinite(startTime)) {
    if (elapsedDurationMs > 0) {
      const elapsedSeconds = Math.max(0, Math.floor(elapsedDurationMs / 1000));
      const hours = Math.floor(elapsedSeconds / 3600);
      const minutes = Math.floor((elapsedSeconds % 3600) / 60);
      const seconds = elapsedSeconds % 60;

      if (hours > 0) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      }

      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    return 'Звонок';
  }

  const elapsedSeconds = Math.max(
    0,
    Math.floor((elapsedDurationMs + (currentTime.value - startTime)) / 1000)
  );
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};
</script>

<style scoped>
.contact-list__avatar--interactive {
  cursor: pointer;
}

.contact-list__description--typing {
  color: var(--primary-color);
}

.contact-list__block--wrapper--selection .contact-list__description,
.contact-list__block--wrapper--selection .contact-list__description p,
.contact-list__block--wrapper--selection .contact-list__description strong {
  width: calc(100vw - 180px);
}

.contact-list__block--wrapper--selection .contact-list__description::after,
.contact-list__block--wrapper--selection .contact-list__description p::after,
.contact-list__block--wrapper--selection
  .contact-list__description
  strong::after {
  left: auto;
  right: 0;
  width: 56px;
}

.contact-list__item--selection.contact-list__item--active
  .contact-list__description::after,
.contact-list__item--selection.contact-list__item--active
  .contact-list__description
  p::after,
.contact-list__item--selection.contact-list__item--active
  .contact-list__description
  strong::after {
  background: linear-gradient(to right, transparent 0%, var(--blue15) 100%);
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
  color: var(--green2);
  width: 20px;
  transform: rotate(-120deg);
}

.contact-list__time--call {
  color: var(--text-color);
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

.contact-list__item--message-result {
  cursor: pointer;
}
</style>
