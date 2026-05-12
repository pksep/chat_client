<template>
  <MessageBubbleCall
    v-if="isCallMessage && !props.loader"
    v-bind="props"
    @navigate-message="$emit('navigate-message')"
  />
  <MessageBubbleEmoji
    v-else-if="isSingleEmojiMessage && !props.loader"
    v-bind="props"
    @navigate-message="$emit('navigate-message')"
  />
  <div v-else class="message-bubble-stack">
    <MessageReferenceBlock
      v-if="showExternalForward"
      :forward-user="props.forwardUser"
      :is-me-sender="props.isMeSender"
      @navigate-message="$emit('navigate-message')"
    />
    <article
      :class="messageArticleStyles"
      :data-testid="`${props.dataTestid}-Article`"
    >
      <MessageBubbleTail
        v-if="!props.continuesWithNext"
        :is-me-sender="props.isMeSender"
      />
      <MessageAuthorMeta
        v-if="
          !props.isMeSender && !isDialogRoute && !props.continuesFromPrevious
        "
        :sender="props.sender"
        :sender-role="props.senderRole"
        :data-testid="`${props.dataTestid}-AuthorMeta`"
      />
      <MessageReferenceBlock
        :forward-user="showExternalForward ? undefined : props.forwardUser"
        :reply-message="props.replyMessage"
        :is-me-sender="props.isMeSender"
        @navigate-message="$emit('navigate-message')"
      />
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
            class="message-content__html"
            v-html="props.message"
            :data-testid="`${props.dataTestid}-MessageText`"
          ></div>
          <div
            v-if="!hasReactions"
            class="message-time message-time--inline"
            :data-testid="`${props.dataTestid}-Time`"
          >
            <PinIcon
              v-if="props.isPin"
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
      <Transition name="reaction-row">
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
        </div>
      </Transition>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { IMessageBubbleProps } from './interface/interface';
import MessageStatusIcons from './MessageStatusIcons.vue';
import PinIcon from '../UI/PinIcon.vue';
import MessageEmojies from './MessageEmojies.vue';
import ErrorIcon from '../UI/ErrorIcon.vue';
import { useUrlWatcher } from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import { MessageStatus } from '../../services/useChatSDK/types';
import MessageReferenceBlock from './MessageReferenceBlock.vue';
import MessageBubbleTail from './MessageBubbleTail.vue';
import MessageBubbleEmoji from './MessageBubbleEmoji.vue';
import MessageBubbleCall from './MessageBubbleCall.vue';
import { parseCallMessage } from '../../utils/parseCallMessage';
import MessageAuthorMeta from './MessageAuthorMeta.vue';

const props = defineProps<IMessageBubbleProps>();

defineEmits(['navigate-message']);

const route = useUrlWatcher();
const isDialogRoute = computed(() => route.value.type === RouteTypes.DIALOGS);

const showErrorIcon = computed(
  () => props.messageStatus === MessageStatus.NotDelivered
);
const showExternalForward = computed(
  () => !isDialogRoute.value && Boolean(props.forwardUser)
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
  /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0F|\uFE0E)?(?:\u200D(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0F|\uFE0E)?)*$/u;
const isCallMessage = computed(() =>
  Boolean(
    parseCallMessage(props.message || '', {
      messageEx: props.messageEx,
      isMeSender: props.isMeSender,
      authUserId: props.authUserId
    })
  )
);
const isSingleEmojiMessage = computed(() =>
  singleEmojiPattern.test(plainMessageText.value)
);

const messageArticleStyles = computed(() => [
  'message__article',
  {
    'message__no-author': props.isMeSender,
    message__article__text: true,
    'message__article__text--emoji': isSingleEmojiMessage.value
  }
]);
</script>
