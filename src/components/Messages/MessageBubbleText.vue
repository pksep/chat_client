<template>
  <MessageBubbleCall
    v-if="isCallMessage && !props.loader"
    v-bind="props"
    @navigate-message="$emit('navigate-message')"
  >
    <template #quick-reply><slot name="quick-reply" /></template>
  </MessageBubbleCall>
  <MessageBubbleEmoji
    v-else-if="isSingleEmojiMessage && !props.loader && !$slots.reference"
    v-bind="props"
    @navigate-message="$emit('navigate-message')"
  >
    <template #quick-reply><slot name="quick-reply" /></template>
  </MessageBubbleEmoji>
  <div v-else class="message-bubble-stack">
    <MessageReferenceBlock
      v-if="showExternalForward"
      :forward-user="props.forwardUser"
      :message-ex="props.messageEx"
      :is-me-sender="props.isMeSender"
      @navigate-message="$emit('navigate-message')"
    />
    <ChatMessageSurface
      unstyled
      ref="messageSurfaceRef"
      :class="messageArticleStyles"
      :data-testid="`${props.dataTestid}-Article`"
    >
      <slot name="quick-reply" />
      <MessageBubbleTail
        v-if="!props.continuesWithNext"
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
      <slot name="reference">
        <MessageReferenceBlock
          v-if="
            props.replyMessage ||
            (!showExternalForward && (props.forwardUser || hasAiSource))
          "
          :forward-user="showExternalForward ? undefined : props.forwardUser"
          :reply-message="props.replyMessage"
          :message-ex="props.messageEx"
          :is-me-sender="props.isMeSender"
          :reference-width="replyReferenceWidth"
          @navigate-message="$emit('navigate-message')"
        />
      </slot>
      <div
        class="message-content message-content--text"
        :data-testid="`${props.dataTestid}-Content`"
      >
        <div
          v-if="props.loader"
          class="message-content__loading"
          :data-testid="`${props.dataTestid}-Loading`"
        >
          <template v-for="i in 3" :key="i">
            <div
              class="message-content__loading-circle"
              :data-testid="`${props.dataTestid}-LoadingCircle${i}`"
            ></div>
          </template>
        </div>
        <template v-else>
          <div
            ref="messageHtmlRef"
            class="message-content__html"
            v-emoji
            v-html="safeMessageHtml"
            :data-testid="`${props.dataTestid}-MessageText`"
            @click="handleMentionUserClick"
            @copy="copyMessageSelection"
          ></div>
          <slot name="after-message" />
          <div
            v-if="!hasReactions"
            class="message-time message-time--inline"
            :data-testid="`${props.dataTestid}-Time`"
          >
            <PinIcon
              v-if="props.isPin"
              :data-testid="`${props.dataTestid}-PinIcon`"
              style="width: 15px; height: 15px; margin-right: -2px"
            />
            <span
              v-if="props.isEdit"
              :data-testid="`${props.dataTestid}-Edited`"
              >изменено</span
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
        </template>
      </div>
      <div v-if="props.reactions?.length" class="message-footer-row">
        <div class="message-reactions-row">
          <MessageEmojies :reactions="props.reactions" />
        </div>
        <div
          v-if="!props.loader"
          class="message-time message-time--bottom"
          :data-testid="`${props.dataTestid}-Time`"
        >
          <PinIcon
            v-if="props.isPin"
            :data-testid="`${props.dataTestid}-PinIcon`"
            style="width: 15px; height: 15px; margin-right: -2px"
          />
          <span v-if="props.isEdit" :data-testid="`${props.dataTestid}-Edited`"
            >изменено</span
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
    </ChatMessageSurface>
  </div>
</template>

<script setup lang="ts">
import { ChatMessageSurface } from '@pksep/yui';
import { computed, nextTick, ref, useSlots, watch } from 'vue';
import type { IMessageBubbleProps } from './interface/interface';
import MessageStatusIcons from './MessageStatusIcons.vue';
import PinIcon from '../UI/PinIcon.vue';
import MessageEmojies from './MessageEmojies.vue';
import ErrorIcon from '../UI/ErrorIcon.vue';
import { MessageStatus } from '../../services/useChatSDK/types';
import MessageReferenceBlock from './MessageReferenceBlock.vue';
import MessageBubbleTail from './MessageBubbleTail.vue';
import MessageBubbleEmoji from './MessageBubbleEmoji.vue';
import MessageBubbleCall from './MessageBubbleCall.vue';
import { parseCallMessage } from '../../utils/parseCallMessage';
import MessageAuthorMeta from './MessageAuthorMeta.vue';
import { useReferenceWidth } from './composables/useReferenceWidth';
import {
  hasMessageInteractivityCandidates,
  useMentionUserClick
} from './composables/useMentionUserClick';
import { sanitizeMessageHtml } from '../../utils/sanitizeMessageHtml';
import { copyMessageSelection } from '../../utils/copyMessageSelection';
import { aiConversationSourceSchema } from '../../services/aiConversationSource';
import { parseMessageEx } from '../../utils/messageReplyQuote';

const props = defineProps<IMessageBubbleProps>();
const slots = useSlots();
const safeMessageHtml = computed(() => sanitizeMessageHtml(props.message));

defineEmits(['navigate-message']);

const messageSurfaceRef = ref<InstanceType<typeof ChatMessageSurface> | null>(
  null
);
const messageArticleRef = computed(
  () => messageSurfaceRef.value?.element ?? null
);
const messageHtmlRef = ref<HTMLElement | null>(null);
const hasReplyReference = computed(() => Boolean(props.replyMessage));
const replyReferenceWidth = useReferenceWidth(messageArticleRef, {
  freezeAfterFirstMeasure: true,
  enabled: hasReplyReference
});

const { handleMentionUserClick, syncMentionUserInteractivity } =
  useMentionUserClick();

const showErrorIcon = computed(
  () => props.messageStatus === MessageStatus.NotDelivered
);
const showExternalForward = computed(
  () => !props.isDialog && Boolean(props.forwardUser || hasAiSource.value)
);
const hasAiSource = computed(
  () =>
    aiConversationSourceSchema.safeParse(
      parseMessageEx(props.messageEx).aiSource
    ).success
);
const hasReactions = computed(() => Boolean(props.reactions?.length));
const plainMessageText = computed(() =>
  (props.message || '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim()
);
const singleEmojiPattern =
  /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0F|\uFE0E)?\p{Emoji_Modifier}?(?:\u200D(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0F|\uFE0E)?\p{Emoji_Modifier}?)*$/u;
const isCallMessage = computed(() =>
  Boolean(
    props.parsedCallMessage !== undefined
      ? props.parsedCallMessage
      : parseCallMessage(props.message || '', {
          messageEx: props.messageEx,
          isMeSender: props.isMeSender,
          authUserId: props.authUserId
        })
  )
);
const isSingleEmojiMessage = computed(() =>
  singleEmojiPattern.test(plainMessageText.value)
);

const syncMentions = async (): Promise<void> => {
  if (!hasMessageInteractivityCandidates(props.message)) {
    return;
  }

  await nextTick();
  syncMentionUserInteractivity(messageHtmlRef.value);
};

const messageArticleStyles = computed(() => [
  'message__article',
  {
    'message__no-author': props.isMeSender,
    message__article__text: true,
    'message__article__text--emoji':
      isSingleEmojiMessage.value && !slots.reference
  }
]);

watch(
  () => props.message,
  () => {
    void syncMentions();
  },
  { immediate: true }
);
</script>
