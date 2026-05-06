<template>
  <div class="message-emoji-stack">
    <MessageReferenceBlock
      v-if="props.forwardUser"
      :forward-user="props.forwardUser"
      :is-me-sender="props.isMeSender"
      @navigate-message="$emit('navigate-message')"
    />

    <article
      :class="[
        'message__article',
        'message__article--emoji',
        { 'message__article--emoji-referenced': hasReplyReference }
      ]"
      :data-testid="`${props.dataTestid}-Article`"
    >
      <MessageBubbleTail
        v-if="!props.continuesWithNext && !hasReplyReference"
        :is-me-sender="props.isMeSender"
      />
      <h3
        v-if="
          !props.isMeSender && !isDialogRoute && !props.continuesFromPrevious
        "
        class="message__article-initals"
      >
        {{ props.sender }}
      </h3>
      <MessageReferenceBlock
        v-if="props.replyMessage"
        :reply-message="props.replyMessage"
        :is-me-sender="props.isMeSender"
        @navigate-message="$emit('navigate-message')"
      />

      <div
        :class="[
          'message-emoji__content',
          { 'message-emoji__content--referenced': hasReplyReference }
        ]"
        :data-testid="`${props.dataTestid}-Content`"
      >
        <div
          :class="[
            'message-emoji__symbol',
            { 'message-emoji__symbol--referenced': hasReplyReference }
          ]"
          :data-testid="`${props.dataTestid}-Emoji`"
        >
          {{ emojiText }}
        </div>
        <div
          v-if="hasReplyReference && !props.reactions?.length"
          class="message-time message-time--emoji-inline"
          :data-testid="`${props.dataTestid}-Time`"
        >
          <span :data-testid="`${props.dataTestid}-TimeText`">{{
            props.time
          }}</span>
          <ErrorIcon
            v-if="showErrorIcon"
            :data-testid="`${props.dataTestid}-ErrorIcon`"
          />
          <MessageStatusIcons
            v-if="props.isMeSender && !showErrorIcon"
            :is-read="props.isRead"
            :message-status="props.messageStatus"
            :data-testid="`${props.dataTestid}`"
          />
        </div>
      </div>

      <Transition name="reaction-row">
        <div v-if="props.reactions?.length" class="message-footer-row">
          <div class="message-reactions-row">
            <MessageEmojies :reactions="props.reactions" />
          </div>
          <div
            :class="[
              'message-time',
              hasReplyReference
                ? 'message-time--emoji-inline'
                : 'message-time--emoji'
            ]"
            :data-testid="`${props.dataTestid}-Time`"
          >
            <span :data-testid="`${props.dataTestid}-TimeText`">{{
              props.time
            }}</span>
            <ErrorIcon
              v-if="showErrorIcon"
              :data-testid="`${props.dataTestid}-ErrorIcon`"
            />
            <MessageStatusIcons
              v-if="props.isMeSender && !showErrorIcon"
              :is-read="props.isRead"
              :message-status="props.messageStatus"
              :data-testid="`${props.dataTestid}`"
            />
          </div>
        </div>
      </Transition>

      <div
        v-if="!props.reactions?.length && !hasReplyReference"
        class="message-time message-time--emoji"
        :data-testid="`${props.dataTestid}-Time`"
      >
        <span :data-testid="`${props.dataTestid}-TimeText`">{{
          props.time
        }}</span>
        <ErrorIcon
          v-if="showErrorIcon"
          :data-testid="`${props.dataTestid}-ErrorIcon`"
        />
        <MessageStatusIcons
          v-if="props.isMeSender && !showErrorIcon"
          :is-read="props.isRead"
          :message-status="props.messageStatus"
          :data-testid="`${props.dataTestid}`"
        />
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { IMessageBubbleProps } from './interface/interface';
import MessageReferenceBlock from './MessageReferenceBlock.vue';
import MessageStatusIcons from './MessageStatusIcons.vue';
import MessageEmojies from './MessageEmojies.vue';
import ErrorIcon from '../UI/ErrorIcon.vue';
import { MessageStatus } from '../../services/useChatSDK/types';
import { useUrlWatcher } from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import MessageBubbleTail from './MessageBubbleTail.vue';

const props = defineProps<IMessageBubbleProps>();

defineEmits(['navigate-message']);

const route = useUrlWatcher();
const isDialogRoute = computed(() => route.value.type === RouteTypes.DIALOGS);

const emojiText = computed(() =>
  (props.message || '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<\/?(p|div|span)[^>]*>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .trim()
);

const showErrorIcon = computed(
  () => props.messageStatus === MessageStatus.NotDelivered
);

const hasReplyReference = computed(() => Boolean(props.replyMessage));
</script>
