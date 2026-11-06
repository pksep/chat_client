<template>
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
      :data-testid="`${props.dataTestid}-ContactList-Title${props.index + 1}`"
    >
      <span class="contact-list__title-text">{{ props.topic.name }}</span>
      <Tooltip
        v-if="topicStatusIcon && topicStatusLabel"
        :hint="topicStatusLabel"
        position="top-center"
        type="black"
        size="small"
        :data-testid="`${props.dataTestid}-ContactList-StatusTooltip${props.index + 1}`"
      >
        <EmojiIcon
          class="contact-list__title-status"
          :emoji="topicStatusIcon"
          @click.stop
        />
      </Tooltip>

      <div
        v-if="topicActiveCall"
        class="contact-list__call-indicator"
        :data-testid="`${props.dataTestid}-ContactList-Call${props.index + 1}`"
        :aria-label="`Active call in ${props.topic.name}`"
      >
        <LeaveIcon class="contact-list__call-indicator-icon" />
        <span class="contact-list__time contact-list__time--call">
          {{ topicActiveCallTime }}
        </span>
      </div>
    </h5>

    <div
      v-if="!props.showCheckbox && !props.showLastOnline"
      class="contact-list__top"
    >
      <MessageStatusIcons
        v-if="showMessageStatus"
        :class="{
          'contact-list__message-status-icons': true,
          'is-read': topicLastMessageStatus === MessageStatusEnum.READ
        }"
        :message-status="topicLastMessageStatus"
        :is-read="topicLastMessageStatus === MessageStatusEnum.READ"
        :is-me-sender="true"
        :data-testid="`${props.dataTestid}-ContactList-MessageStatusIcons${props.index + 1}`"
      />
      <span
        v-if="props.topic.lastMessage?.createdAt"
        class="contact-list__time"
        :data-testid="`${props.dataTestid}-ContactList-Time${props.index + 1}`"
        :aria-label="`Last message at ${formatListTime(new Date(props.topic.lastMessage.createdAt))}`"
      >
        {{ formatListTime(new Date(props.topic.lastMessage.createdAt)) }}
      </span>
    </div>

    <div class="contact-list__preview">
      <div
        v-if="props.showLastOnline && topicPresenceText"
        :class="[
          'contact-list__description',
          'contact-list__description--last-online',
          {
            'contact-list__description--online': topicPresenceIsOnline
          }
        ]"
        :data-testid="`${props.dataTestid}-ContactList-LastOnline${props.index + 1}`"
      >
        {{ topicPresenceText }}
      </div>
      <div
        v-else-if="!props.showLastOnline && topicTypingLabel"
        :class="[
          'contact-list__description',
          'contact-list__description--typing',
          {
            'contact-list__description--overflow': props.forceDescriptionFade
          }
        ]"
        :data-testid="`${props.dataTestid}-ContactList-Typing${props.index + 1}`"
      >
        <TypingIndicator :label="topicTypingLabel" />
      </div>
      <div
        v-else-if="!props.showLastOnline && !!lastMessagePreview"
        :key="lastMessagePreviewKey"
        :class="[
          'contact-list__description',
          {
            'contact-list__description--overflow': props.forceDescriptionFade
          }
        ]"
        v-emoji
        :data-testid="`${props.dataTestid}-ContactList-Description${props.index + 1}`"
        :aria-label="`Latest message: ${lastMessagePreview}`"
      >
        {{ lastMessagePreview }}
      </div>
      <div
        v-else-if="
          !props.showLastOnline &&
          props.topic.lastMessage?.media?.length > 0 &&
          props.topic.lastMessage.media[0].type === MediaType.File
        "
        :class="[
          'contact-list__description',
          'contact-list__description__media',
          {
            'contact-list__description--overflow': props.forceDescriptionFade
          }
        ]"
      >
        <AttachFileIcon />
        <p>Медиа</p>
      </div>
      <div
        v-else-if="
          !props.showLastOnline && props.topic.lastMessage?.media?.length > 0
        "
        :class="[
          'contact-list__description',
          'contact-list__description__media',
          {
            'contact-list__description--overflow': props.forceDescriptionFade
          }
        ]"
        :data-testid="`${props.dataTestid}-ContactList-Media${props.index + 1}`"
      >
        <template
          v-for="media in props.topic.lastMessage.media.slice(0, 3)"
          :key="media.id"
        >
          <div>
            <img
              v-if="media.type !== MediaType.File"
              :src="getFullMediaPath(media)"
              alt=""
            />
            <MiniPlayIcon
              v-if="media.type === MediaType.Video"
              class="contact-list__description__media__play"
            />
          </div>
        </template>
        <p>{{ getTopicLastMessageLabel(props.topic.lastMessage.media) }}</p>
      </div>

      <div
        v-if="!props.showCheckbox && !props.showLastOnline"
        class="contact-list__bottom"
      >
        <div
          v-if="props.topic.hasUnreadReaction && unreadReactionMessageId"
          class="contact-list__reaction-indicator"
          :data-testid="`${props.dataTestid}-ContactList-Reaction${props.index + 1}`"
          role="button"
          tabindex="0"
          aria-label="Новая реакция на ваше сообщение"
          @click.stop="event => emitReactionClick(event)"
          @keydown.enter.stop="event => emitReactionClick(event)"
          @keydown.space.stop.prevent="event => emitReactionClick(event)"
        >
          <ReactionHeartIcon />
        </div>
        <div
          v-if="props.topic.taggedMe"
          class="contact-list__notification contact-list__mention"
          :data-testid="`${props.dataTestid}-ContactList-Mention${props.index + 1}`"
        >
          @
        </div>
        <div
          v-if="showUnreadIndicator"
          :class="{
            'contact-list__notification': true,
            'contact-list__notification--muted': props.topic.info?.isMute
          }"
          :data-testid="`${props.dataTestid}-ContactList-Notification${props.index + 1}`"
          :aria-label="unreadIndicatorLabel"
        >
          <template v-if="unreadBadgeCount">
            {{ unreadBadgeLabel(unreadBadgeCount) }}
          </template>
        </div>
        <div
          v-if="props.topic.info?.isPin"
          class="contact-list__pin"
          :data-testid="`${props.dataTestid}-ContactList-Pin${props.index + 1}`"
          aria-label="Pinned contact"
        >
          <PinIcon />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { unreadBadgeLabel } from '../../utils/unread-badge-label';
import { computed, watch } from 'vue';
import { Tooltip } from '@pksep/yui';
import { MediaType } from '@pksep/zod-shared-chat';
import { hasExternalMessageChannel } from '../../utils/managerMessageChannel';
import { getAuthUser } from '../../composables/useAuth';
import { formatListTime } from '../../composables/useTime';
import { useTopics } from '../../composables/useTopics';
import { getUserById, getUserLastOnline } from '../../composables/useUsers';
import { useMessageMedia } from '../Messages/composables/useMessageMedia';
import type { IMedia, ITopic } from '../interfaces/interfaces';
import { MessageStatusEnum } from '../interfaces/interfaces';
import { TopicType } from '../../services/useChatSDK/types';
import {
  activeCallFormattedTime,
  activeCallTopicId,
  isCallActive,
  pendingGroupCallInfo
} from '../../services/useCallState';
import { getClientMessageById } from '../../services/useMessages';
import { isFavoriteTopic } from '../../utils/favorite-topic';
import { getTopicActivityLabel } from '../../composables/useTopicActivity';
import {
  getTopicUnreadBadgeCount,
  hasTopicUnreadIndicator
} from '../../utils/topicUnreadBadge';
import { resolveLastMessageStatus } from '../../utils/topic-last-message';
import {
  getMessageDisplayStatus,
  mergeMessageDeliveryState,
  mergeMessageReceipts
} from '../../utils/message-delivery-status';
import { getTopicStateDiagnostic } from '../../utils/topic-state-diagnostics';
import { recordTopicStateTelemetry } from '../../services/topic-state-telemetry';
import { useMessagePreview } from '../../composables/useMessagePreview';
import { formatLastSeen } from '../../utils/dateUtils';
import { formatUserStatusText } from '../../utils/userStatus';
import { getBotUsername, isBotTopic, isDeletedBotUser } from '../../utils/bot';
import { preloadNotoEmojiAssets } from '../../composables/useEmojiStyle';
import AttachFileIcon from '../UI/AttachFileIcon.vue';
import EmojiIcon from '../UI/EmojiIcon.vue';
import LeaveIcon from '../CallModal/UI/LeaveIcon.vue';
import MessageStatusIcons from '../Messages/MessageStatusIcons.vue';
import MiniPlayIcon from '../UI/MiniPlayIcon.vue';
import PinIcon from '../UI/PinIcon.vue';
import ReactionHeartIcon from '../UI/ReactionHeartIcon.vue';
import TypingIndicator from '../UI/TypingIndicator.vue';

interface ITopicListItemContentProps {
  topic: ITopic;
  index: number;
  dataTestid?: string;
  showCheckbox?: boolean;
  showLastOnline?: boolean;
  currentTime?: number;
  forceDescriptionFade?: boolean;
}

const props = withDefaults(defineProps<ITopicListItemContentProps>(), {
  dataTestid: 'TopicListItemContent',
  showCheckbox: false,
  showLastOnline: false,
  currentTime: 0,
  forceDescriptionFade: false
});

const emits = defineEmits<{
  (e: 'reaction-click', event: Event): void;
}>();

const authedUser = computed(() => getAuthUser());
const lastMessagePreview = useMessagePreview(() => props.topic.lastMessage);
const { getTopicTypingUsers, getTopicUnreadReactionMessageId } = useTopics();
const { getFullMediaPath } = useMessageMedia();

const topicIsFavorite = computed(() =>
  isFavoriteTopic(props.topic, authedUser.value?.id)
);
const topicEffectiveUser = computed(() =>
  props.topic.type === TopicType.DM && props.topic.user?.id
    ? getUserById(props.topic.user.id) || props.topic.user
    : props.topic.user
);
const topicStatusIcon = computed(() =>
  props.topic.type === TopicType.DM
    ? topicEffectiveUser.value?.status?.icon || ''
    : ''
);
const topicStatusLabel = computed(() =>
  props.topic.type === TopicType.DM
    ? formatUserStatusText(topicEffectiveUser.value?.status)
    : ''
);
const topicPresenceText = computed(() => {
  const user = topicEffectiveUser.value;

  if (
    !props.showLastOnline ||
    props.topic.type !== TopicType.DM ||
    topicIsFavorite.value ||
    !user
  ) {
    return '';
  }

  if (isDeletedBotUser(user)) return 'Оффлайн';
  if (isBotTopic(props.topic)) return `@${getBotUsername(user)}`;
  if (authedUser.value?.id === user.id) return `@${user.nickname || ''}`;

  return formatLastSeen(getUserLastOnline(user));
});
const topicPresenceIsOnline = computed(() => {
  const user = topicEffectiveUser.value;

  return (
    !!user &&
    props.topic.type === TopicType.DM &&
    !topicIsFavorite.value &&
    !isDeletedBotUser(user) &&
    getUserLastOnline(user) === null &&
    authedUser.value?.id !== user.id
  );
});
const topicLastMessageStatus = computed(() => {
  const message = props.topic.lastMessage;
  if (!message) return undefined;
  const cached = getClientMessageById(props.topic.id, message.id);
  const deliveryState = mergeMessageDeliveryState(
    message.deliveryState,
    cached?.deliveryState
  );
  const status = resolveLastMessageStatus(message, cached);
  return getMessageDisplayStatus({
    ...message,
    status,
    deliveryState: deliveryState && {
      ...deliveryState,
      read: mergeMessageReceipts(deliveryState.read, cached?.messageRead)
    }
  });
});
const lastMessagePreviewKey = computed(() => {
  const lastMessage = props.topic.lastMessage;

  return `${props.topic.id}:${lastMessage?.id || ''}:${lastMessagePreview.value}`;
});
const showMessageStatus = computed(
  () =>
    props.topic.lastMessage?.senderUserId === authedUser.value?.id &&
    !props.topic.lastMessage?.isSystem &&
    !hasExternalMessageChannel(props.topic.lastMessage?.ex)
);
const topicTypingLabel = computed(() =>
  getTopicActivityLabel(props.topic, getTopicTypingUsers(props.topic.id))
);
const unreadReactionMessageId = computed(
  () =>
    getTopicUnreadReactionMessageId(props.topic.id) ||
    props.topic.unreadReactionMessageId ||
    null
);
const unreadBadgeCount = computed(() =>
  getTopicUnreadBadgeCount(props.topic, authedUser.value?.id)
);
const showUnreadIndicator = computed(() =>
  hasTopicUnreadIndicator(props.topic, authedUser.value?.id)
);

const topicDiagnostic = computed(() => ({
  ...getTopicStateDiagnostic(
    props.topic,
    getClientMessageById(props.topic.id, props.topic.lastMessage?.id),
    authedUser.value?.id
  ),
  unreadBadgeCount: unreadBadgeCount.value,
  showUnreadIndicator: showUnreadIndicator.value
}));

const recordRenderedTopicState = (source: string, warning = false) =>
  recordTopicStateTelemetry(
    source,
    props.topic,
    getClientMessageById(props.topic.id, props.topic.lastMessage?.id),
    authedUser.value?.id,
    {
      unreadBadgeCount: unreadBadgeCount.value,
      showUnreadIndicator: showUnreadIndicator.value
    },
    warning
  );

watch(
  topicDiagnostic,
  (snapshot, previous) => {
    if (props.showCheckbox || props.showLastOnline) return;
    if (snapshot.statusMismatch)
      recordRenderedTopicState('topic_list_render', true);
    else if (previous && JSON.stringify(snapshot) !== JSON.stringify(previous))
      recordRenderedTopicState('topic_list_render');
  },
  { immediate: true, flush: 'post' }
);

watch(
  [
    () => props.topic.id,
    () => props.topic.lastMessage?.id,
    () => topicLastMessageStatus.value,
    () =>
      showMessageStatus.value && !props.showCheckbox && !props.showLastOnline
  ],
  ([, , status, visible], _, onCleanup) => {
    if (!visible || status !== MessageStatusEnum.WAIT) return;
    const timeout = setTimeout(
      () => recordRenderedTopicState('topic_list_wait_timeout', true),
      30_000
    );
    onCleanup(() => clearTimeout(timeout));
  },
  { immediate: true, flush: 'post' }
);
const unreadIndicatorLabel = computed(() =>
  unreadBadgeCount.value > 0
    ? `${unreadBadgeCount.value} new messages`
    : `${props.topic.name} marked as new`
);
const formatElapsedDuration = (durationMs: number): string => {
  const elapsedSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  return hours > 0
    ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};
const topicActiveCall = computed(() => {
  if (topicIsFavorite.value) return null;

  if (isCallActive.value && activeCallTopicId.value === props.topic.id) {
    return {
      roomId: props.topic.activeCall?.roomId || props.topic.id,
      startTime: props.topic.activeCall?.startTime ?? null
    };
  }

  return (
    pendingGroupCallInfo.value?.[props.topic.id] ||
    props.topic.activeCall ||
    null
  );
});
const topicActiveCallTime = computed(() => {
  if (isCallActive.value && activeCallTopicId.value === props.topic.id) {
    return activeCallFormattedTime.value;
  }

  const startTime = topicActiveCall.value?.startTime;
  const elapsedDurationMs = topicActiveCall.value?.elapsedDurationMs ?? 0;

  if (typeof startTime !== 'number' || !Number.isFinite(startTime)) {
    if (elapsedDurationMs <= 0) return 'Звонок';
    return formatElapsedDuration(elapsedDurationMs);
  }

  return formatElapsedDuration(
    elapsedDurationMs + ((props.currentTime || Date.now()) - startTime)
  );
});

watch(
  topicStatusIcon,
  icon => {
    if (icon) preloadNotoEmojiAssets([icon], { highPriority: true });
  },
  { immediate: true }
);

const getTopicLastMessageLabel = (media: IMedia[]): string => {
  const labels: string[] = [];
  if (media.some(item => item.type === MediaType.Image)) labels.push('Фото');
  if (media.some(item => item.type === MediaType.Video)) labels.push('видео');
  return labels.join(', ');
};

const emitReactionClick = (event: Event): void => {
  emits('reaction-click', event);
};
</script>

<style scoped>
.contact-list__description--typing {
  color: var(--primary-color);
}

.contact-list__description--last-online {
  height: 17px;
  margin-top: 0;
  font-size: 14px;
  line-height: 17px;
}

.contact-list__description--online {
  color: var(--primary-base);
}

.contact-list__block--wrapper--selection {
  --description-fade-width: 56px;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas:
    'title'
    'preview';
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
  width: 50px;
  font-size: 12px;
  font-weight: 400;
  line-height: 15px;
}
</style>
