<template>
  <div class="message-emoji-stack">
    <MessageReferenceBlock
      v-if="props.forwardUser"
      :forward-user="props.forwardUser"
      :is-me-sender="props.isMeSender"
      @navigate-message="$emit('navigate-message')"
    />

    <article
      ref="emojiArticleRef"
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
      <MessageAuthorMeta
        v-if="
          !props.isMeSender && !props.isDialog && !props.continuesFromPrevious
        "
        :sender="props.sender"
        :sender-user="props.senderUser"
        :sender-role="props.senderRole"
        :data-testid="`${props.dataTestid}-AuthorMeta`"
      />
      <MessageReferenceBlock
        v-if="props.replyMessage"
        :reply-message="props.replyMessage"
        :message-ex="props.messageEx"
        :is-me-sender="props.isMeSender"
        :reference-width="replyReferenceWidth"
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
          <template v-if="emojiSymbols.length">
            <EmojiIcon
              v-for="(emoji, index) in emojiSymbols"
              :key="`${emoji}-${index}`"
              class="message-emoji__symbol-icon"
              :emoji="emoji"
              :animated="true"
            />
          </template>
          <span v-else>{{ emojiText }}</span>
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
import { computed, ref, watch } from 'vue';
import type { IMessageBubbleProps } from './interface/interface';
import MessageReferenceBlock from './MessageReferenceBlock.vue';
import MessageStatusIcons from './MessageStatusIcons.vue';
import MessageEmojies from './MessageEmojies.vue';
import ErrorIcon from '../UI/ErrorIcon.vue';
import { MessageStatus } from '../../services/useChatSDK/types';
import MessageBubbleTail from './MessageBubbleTail.vue';
import MessageAuthorMeta from './MessageAuthorMeta.vue';
import { useReferenceWidth } from './composables/useReferenceWidth';
import EmojiIcon from '../UI/EmojiIcon.vue';
import {
  extractEmojiGraphemes,
  preloadNotoEmojiAssets
} from '../../composables/useEmojiStyle';

const props = defineProps<IMessageBubbleProps>();

defineEmits(['navigate-message']);

const emojiArticleRef = ref<HTMLElement | null>(null);
const hasReplyReference = computed(() => Boolean(props.replyMessage));
const replyReferenceWidth = useReferenceWidth(emojiArticleRef, {
  freezeAfterFirstMeasure: true,
  enabled: hasReplyReference
});

const emojiText = computed(() =>
  (props.message || '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<\/?(p|div|span)[^>]*>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .trim()
);
const emojiSymbols = computed(() => extractEmojiGraphemes(emojiText.value));

watch(
  emojiSymbols,
  emojis => {
    preloadNotoEmojiAssets(emojis, {
      highPriority: true
    });
  },
  {
    immediate: true
  }
);

const showErrorIcon = computed(
  () => props.messageStatus === MessageStatus.NotDelivered
);
</script>
