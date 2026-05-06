<template>
  <div class="reactions">
    <TransitionGroup name="reaction" tag="div" class="reactions">
      <div
        v-for="(messageReaction, emoji) in reactionContent"
        :key="emoji"
        class="reaction"
        @click="handleToggleEmoji(messageReaction)"
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
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Reaction } from '@pksep/zod-shared-chat';
import { setReactionMessage } from '../../services/useChat';
import { useUrlWatcher } from '../../composables/navigation';
import { getUserById } from '../../composables/useUsers';
import type { IUser } from '../interfaces/interfaces';
import CachedAvatar from '../UI/CachedAvatar.vue';

const props = defineProps<{ reactions: Reaction[] }>();

type MessageReactions = Reaction & { count: number; user?: IUser };

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

const handleToggleEmoji = (messageReaction: MessageReactions) => {
  setReactionMessage({
    messageId: messageReaction.messageId,
    emoji: messageReaction.text,
    topicId: route.value.id
  });
};
</script>
