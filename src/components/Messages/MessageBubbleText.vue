<template>
  <article
    :class="messageArticleStyles"
    :data-testid="`${props.dataTestid}-Article`"
  >
    <h5 v-if="props.forwardUser" class="message__article-forward-info">
      Переслано: от {{ props.forwardUser.initials }}
    </h5>
    <h3
      class="message__article-initals"
      v-if="!props.isMeSender && !isDialogRoute"
    >
      {{ props.sender }}
    </h3>
    <div class="message-content" :data-testid="`${props.dataTestid}-Content`">
      <blockquote
        v-if="!!props.replyMessage"
        @click="$emit('navigate-message')"
        class="message-content__blockquote"
        :data-testid="`${props.dataTestid}-Blockquote`"
      >
        <div
          class="message-content__blockquote-container"
          :data-testid="`${props.dataTestid}-BlockquoteContainer`"
        >
          <h5 :data-testid="`${props.dataTestid}-BlockquoteAuthor`">
            {{ props.replyMessage?.senderUser?.initials }}
          </h5>
          <p :data-testid="`${props.dataTestid}-BlockquoteText`">
            {{ stripHtml(props.replyMessage?.text || 'Вложение') }}
          </p>
        </div>
      </blockquote>
      <div
        class="message-content__loading"
        v-if="props.loader"
        :data-testid="`${props.dataTestid}-Loading`"
      >
        <template v-for="i in 3" :key="i">
          <div
            class="message-content__loading-circle"
            :data-testid="`${props.dataTestid}-LoadingCircle${i}`"
          ></div>
        </template>
      </div>
      <template v-else-if="!props.loader">
        <div
          class="message-content__html"
          v-html="props.message"
          :data-testid="`${props.dataTestid}-MessageText`"
        ></div>
      </template>
    </div>
    <div
      class="message-time"
      v-if="!props.loader"
      :data-testid="`${props.dataTestid}-Time`"
    >
      <MessageEmojies :reactions="props.reactions" />
      <PinIcon
        style="width: 15px; height: 15px; margin-right: -2px"
        v-if="props.isPin"
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
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { IMessageBubbleProps } from './interface/interface';
import MessageStatusIcons from './MessageStatusIcons.vue';
import PinIcon from '../UI/PinIcon.vue';
import MessageEmojies from './MessageEmojies.vue';
import ErrorIcon from '../UI/ErrorIcon.vue';
import { stripHtml } from '../../utils/stripHtml';
import { useUrlWatcher } from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import { MessageStatus } from '../../services/useChatSDK/types';

const props = defineProps<IMessageBubbleProps>();

defineEmits(['navigate-message']);

const route = useUrlWatcher();
const isDialogRoute = computed(() => route.value.type === RouteTypes.DIALOGS);

const showErrorIcon = computed(
  () =>
    props.messageStatus === MessageStatus.NotDelivered ||
    props.messageStatus === MessageStatus.Wait
);

const messageArticleStyles = computed(() => [
  'message__article',
  {
    'message__no-author': props.isMeSender,
    message__article__text: true
  }
]);
</script>
