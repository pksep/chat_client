<template>
  <div class="reactions">
    <TransitionGroup name="reaction" tag="div" class="reactions">
      <div
        v-for="(messageReaction, emoji) in reactionContent"
        :key="emoji"
        class="reaction"
        @click.stop="handleToggleEmoji(messageReaction)"
        @contextmenu="handleOpenReactionDetails($event)"
        @touchstart="handleTouchStart($event)"
        @touchend="clearLongPress"
        @touchcancel="clearLongPress"
        @touchmove="clearLongPress"
      >
        <div class="reaction-item">
          {{ emoji }}
        </div>
        <CachedAvatar
          v-if="messageReaction.count === 1 && messageReaction.user"
          class="reaction-avatar"
          :path="messageReaction.user.avatarUrl"
          :initials="messageReaction.user.initials"
          :alt="messageReaction.user.initials"
        />
        <p class="reaction-count" v-if="messageReaction.count > 1">
          {{ messageReaction.count }}
        </p>
      </div>
    </TransitionGroup>

    <Teleport to="body">
      <div
        v-if="showReactionDetails"
        ref="reactionDetailsPanelRef"
        v-on-click-outside="closeReactionDetails"
        class="message-reactions-details"
        :style="reactionDetailsStyle"
      >
        <div class="message-reactions-details__title">
          <span>Реакции</span>
          <span class="message-reactions-details__count">
            {{ reactionDetails.length }}
          </span>
        </div>

        <div
          v-if="reactionDetails.length"
          class="message-reactions-details__list"
        >
          <button
            v-for="reaction in reactionDetails"
            :key="reaction.id"
            type="button"
            class="message-reactions-details__item"
            :class="{
              'message-reactions-details__item--interactive': reaction.isOwn
            }"
            @click.stop="handleReactionDetailsItemClick(reaction)"
          >
            <div class="message-reactions-details__item-main">
              <CachedAvatar
                class="message-reactions-details__avatar"
                :path="reaction.avatarPath"
                :initials="reaction.avatarInitials"
                :alt="reaction.name"
              />

              <div class="message-reactions-details__meta">
                <div class="message-reactions-details__name">
                  {{ reaction.name }}
                </div>
                <div
                  v-if="reaction.isOwn"
                  class="message-reactions-details__hint"
                >
                  Нажмите, чтобы удалить
                </div>
              </div>
            </div>

            <div class="message-reactions-details__emoji">
              {{ reaction.emoji }}
            </div>
          </button>
        </div>

        <div v-else class="message-reactions-details__empty">
          Реакций пока нет
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { Reaction } from '@pksep/zod-shared-chat';
import { setReactionMessage } from '../../services/useChat';
import { useUrlWatcher } from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import { getUserById } from '../../composables/useUsers';
import { getAuthUser } from '../../composables/useAuth';
import type { IUser } from '../interfaces/interfaces';
import CachedAvatar from '../UI/CachedAvatar.vue';
import { useUserInfoModal } from '../../composables/useUserInfoModal';

const LONG_PRESS_DELAY_MS = 450;
const VIEWPORT_OFFSET_PX = 8;

const props = defineProps<{ reactions: Reaction[] }>();

type MessageReactions = Reaction & { count: number; user?: IUser };

type ReactionDetailsItem = {
  id: string;
  messageId: string;
  emoji: string;
  userId: string;
  user?: IUser;
  name: string;
  avatarPath: string;
  avatarInitials: string;
  isOwn: boolean;
  createdAtMs: number;
};

const reactionContent = computed<Record<string, MessageReactions>>(
  () =>
    props.reactions?.reduce(
      (aggr, val) => {
        if (aggr[val.text]?.count > 0) {
          aggr[val.text].count++;
        } else {
          aggr[val.text] = {
            ...val,
            count: 1,
            user: getUserById(val.senderUserId)
          };
        }
        return aggr;
      },
      {} as Record<string, MessageReactions>
    ) || {}
);

const route = useUrlWatcher();
const canShowReactionDetails = computed(
  () => route.value.type === RouteTypes.GROUP
);
const currentUserId = computed(() => getAuthUser()?.id || '');
const showReactionDetails = ref(false);
const reactionDetailsPanelRef = ref<HTMLElement | null>(null);
const reactionDetailsStyle = ref<Record<string, string>>({
  left: '0px',
  top: '0px'
});
const reactionDetailsAnchor = ref({ x: 0, y: 0 });
let longPressTimeout: ReturnType<typeof setTimeout> | null = null;
let suppressNextToggle = false;
const { openUserInfo } = useUserInfoModal();

const reactionDetails = computed<ReactionDetailsItem[]>(() =>
  [...(props.reactions || [])]
    .map(reaction => {
      const user = getUserById(reaction.senderUserId);
      const name = user?.initials || user?.nickname || 'Пользователь';
      const createdAt = reaction.updatedAt || reaction.createdAt || new Date(0);
      const createdAtMs = new Date(createdAt).getTime();
      const isOwn = reaction.senderUserId === currentUserId.value;

      return {
        id: reaction.id,
        messageId: reaction.messageId,
        emoji: reaction.text,
        userId: reaction.senderUserId,
        user,
        name,
        avatarPath: user?.avatarUrl || '',
        avatarInitials: user?.initials || user?.nickname || name,
        isOwn,
        createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0
      };
    })
    .sort((left, right) => {
      if (left.isOwn !== right.isOwn) {
        return left.isOwn ? -1 : 1;
      }

      if (left.createdAtMs !== right.createdAtMs) {
        return left.createdAtMs - right.createdAtMs;
      }

      return left.name.localeCompare(right.name, 'ru');
    })
);

const syncReactionDetailsPosition = () => {
  const panel = reactionDetailsPanelRef.value;

  if (!panel) {
    return;
  }

  const rect = panel.getBoundingClientRect();
  const { x, y } = reactionDetailsAnchor.value;
  let left = x;
  let top = y;

  if (left + rect.width > window.innerWidth - VIEWPORT_OFFSET_PX) {
    left = Math.max(VIEWPORT_OFFSET_PX, x - rect.width + VIEWPORT_OFFSET_PX);
  }

  if (top + rect.height > window.innerHeight - VIEWPORT_OFFSET_PX) {
    top = Math.max(VIEWPORT_OFFSET_PX, y - rect.height - VIEWPORT_OFFSET_PX);
  }

  reactionDetailsStyle.value = {
    left: `${left}px`,
    top: `${top}px`
  };
};

const openReactionDetails = async (x: number, y: number) => {
  if (!canShowReactionDetails.value) {
    return;
  }

  reactionDetailsAnchor.value = { x, y };
  showReactionDetails.value = true;
  reactionDetailsStyle.value = {
    left: `${x}px`,
    top: `${y}px`,
    visibility: 'hidden'
  };

  await nextTick();
  syncReactionDetailsPosition();
};

const closeReactionDetails = () => {
  showReactionDetails.value = false;
};

const clearLongPress = () => {
  if (longPressTimeout) {
    clearTimeout(longPressTimeout);
    longPressTimeout = null;
  }
};

const handleToggleEmoji = (messageReaction: MessageReactions) => {
  if (suppressNextToggle) {
    suppressNextToggle = false;
    return;
  }

  setReactionMessage({
    messageId: messageReaction.messageId,
    emoji: messageReaction.text,
    topicId: route.value.id
  });
};

const handleOpenReactionDetails = (event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();

  if (!canShowReactionDetails.value) {
    return;
  }

  void openReactionDetails(event.clientX, event.clientY);
};

const handleTouchStart = (event: TouchEvent) => {
  if (!canShowReactionDetails.value) {
    return;
  }

  const touch = event.touches[0];

  if (!touch) {
    return;
  }

  clearLongPress();
  longPressTimeout = setTimeout(() => {
    longPressTimeout = null;
    suppressNextToggle = true;
    void openReactionDetails(touch.clientX, touch.clientY);
  }, LONG_PRESS_DELAY_MS);
};

const handleReactionDetailsItemClick = (reaction: ReactionDetailsItem) => {
  if (!reaction.isOwn) {
    if (reaction.user) {
      openUserInfo(reaction.user);
    }
    return;
  }

  closeReactionDetails();
  setReactionMessage({
    messageId: reaction.messageId,
    emoji: reaction.emoji,
    topicId: route.value.id
  });
};

onBeforeUnmount(() => {
  clearLongPress();
});
</script>
