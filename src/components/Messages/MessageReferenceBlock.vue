<template>
  <div
    v-if="aiSource || props.forwardUser || shouldRenderReply"
    class="message-reference-block"
    :class="{ 'message-reference-block--outgoing': props.isMeSender }"
  >
    <button
      v-if="aiSource"
      type="button"
      class="message-reference-forward message-reference-forward--interactive message-reference-forward--ai"
      @click.stop="openAiInfo(aiSource.threadId, aiSource)"
    >
      Переслано: от СЭПи
    </button>
    <div
      v-else-if="props.forwardUser"
      :class="[
        'message-reference-forward',
        {
          'message-reference-forward--interactive': canOpenUserInfo(
            props.forwardUser
          )
        }
      ]"
      @click.stop="handleOpenUserInfo(props.forwardUser)"
    >
      Переслано: от {{ props.forwardUser.initials }}
    </div>

    <button
      v-if="shouldRenderReply"
      type="button"
      class="message-reference-reply"
      :style="replyInlineStyle"
      @click="$emit('navigate-message')"
    >
      <div
        v-if="replyPreviewMedia"
        class="message-reference-reply__media"
        :class="{
          'message-reference-reply__media--file':
            replyPreviewMedia.type === MediaType.File
        }"
      >
        <img
          v-if="replyPreviewMedia.type !== MediaType.File"
          :src="getFullMediaPath(replyPreviewMedia)"
          alt=""
        />
        <FileIcon
          v-else
          :is-me-sender="false"
          :is-loaded="true"
          background-color="#d7e3fb"
        />
      </div>

      <div
        class="message-reference-reply__content"
        :style="replyContentInlineStyle"
      >
        <div
          :class="[
            'message-reference-reply__author',
            {
              'message-reference-reply__author--interactive': canOpenUserInfo(
                props.replyMessage?.senderUser
              )
            }
          ]"
        >
          {{ replyAuthor }}
        </div>
        <div
          v-emoji
          class="message-reference-reply__text"
          :style="replyTextInlineStyle"
        >
          {{ replyText }}
        </div>
      </div>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { MediaType } from '@pksep/zod-shared-chat';
import FileIcon from '../UI/FileIcon.vue';
import { useMessageMedia } from './composables/useMessageMedia';
import type { IMessageBubbleProps } from './interface/interface';
import { useUserInfoModal } from '../../composables/useUserInfoModal';
import { getMessageReplyQuoteText } from '../../utils/messageReplyQuote';
import { parseMessageEx } from '../../utils/messageReplyQuote';
import { aiConversationSourceSchema } from '../../services/aiConversationSource';
import { useAiConversationInfo } from '../../composables/useAiConversationInfo';

const props = defineProps<{
  forwardUser?: IMessageBubbleProps['forwardUser'];
  replyMessage?: IMessageBubbleProps['replyMessage'];
  messageEx?: IMessageBubbleProps['messageEx'];
  isMeSender?: boolean;
  referenceWidth?: number | null;
  deferUntilMeasured?: boolean;
}>();

defineEmits(['navigate-message']);

const { getFullMediaPath } = useMessageMedia();
const { open: openAiInfo } = useAiConversationInfo();
const aiSource = computed(() => {
  const result = aiConversationSourceSchema.safeParse(
    parseMessageEx(props.messageEx).aiSource
  );

  return result.success ? result.data : null;
});
const { openUserInfo, canOpenUserInfo } = useUserInfoModal();

const replyPreviewMedia = computed(() => {
  const medias = props.replyMessage?.media || [];

  return (
    medias.find(media => media.type === MediaType.Image) ||
    medias.find(media => media.type === MediaType.Video) ||
    medias[0]
  );
});

const replyAuthor = computed(
  () => props.replyMessage?.senderUser?.initials || 'Сообщение'
);
const replyQuoteText = computed(() =>
  getMessageReplyQuoteText(props.messageEx)
);

const replyInlineStyle = computed(() => {
  if (!props.referenceWidth || props.referenceWidth <= 0) {
    return undefined;
  }

  return {
    '--message-reference-width': `${props.referenceWidth}px`
  };
});

const replyTextWidth = computed(() => {
  if (!props.referenceWidth || props.referenceWidth <= 0) {
    return null;
  }

  const horizontalPadding = 20;
  const mediaWidth = replyPreviewMedia.value ? 34 : 0;
  const mediaGap = replyPreviewMedia.value ? 10 : 0;
  const safeWidth =
    props.referenceWidth - horizontalPadding - mediaWidth - mediaGap;

  return safeWidth > 0 ? safeWidth : null;
});

const replyContentInlineStyle = computed(() => {
  if (!replyTextWidth.value) {
    return undefined;
  }

  return {
    width: `${Math.max(replyTextWidth.value - 30, 100)}px`,
    maxWidth: `${Math.max(replyTextWidth.value - 30, 100)}px`
  };
});

const replyTextInlineStyle = computed(() => {
  if (!replyTextWidth.value) {
    return undefined;
  }

  return {
    width: `${Math.max(replyTextWidth.value - 20, 100)}px`,
    maxWidth: `${Math.max(replyTextWidth.value - 20, 100)}px`
  };
});

const shouldRenderReply = computed(() => {
  if (!props.replyMessage) {
    return false;
  }

  if (!props.deferUntilMeasured) {
    return true;
  }

  return Boolean(props.referenceWidth && props.referenceWidth > 0);
});

const handleOpenUserInfo = (
  user?: IMessageBubbleProps['forwardUser']
): void => {
  if (!user) {
    return;
  }

  openUserInfo(user);
};

const replyText = computed(() => {
  const replyMessage = props.replyMessage;
  const previewMedia = replyPreviewMedia.value;

  if (!replyMessage) {
    return '';
  }

  if (replyQuoteText.value) {
    return replyQuoteText.value;
  }

  if (previewMedia?.type === MediaType.File) {
    return previewMedia.originName || 'Файл';
  }

  if (previewMedia?.type === MediaType.Video) {
    return 'Видео';
  }

  if (previewMedia?.type === MediaType.Image) {
    return 'Фотография';
  }

  const rawText = replyMessage.text?.replace(/<[^>]*>/g, ' ').trim();
  return rawText || 'Вложение';
});
</script>

<style scoped>
.message-reference-forward--ai {
  border: 0;
  background: transparent;
  padding: 0;
  font: inherit;
  color: inherit;
  text-align: left;
}
.message-reference-forward--interactive,
.message-reference-reply__author--interactive {
  cursor: pointer;
}
</style>
