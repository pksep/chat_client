<template>
  <div
    v-if="props.forwardUser || props.replyMessage"
    class="message-reference-block"
    :class="{ 'message-reference-block--outgoing': props.isMeSender }"
  >
    <div v-if="props.forwardUser" class="message-reference-forward">
      Переслано: от {{ props.forwardUser.initials }}
    </div>

    <button
      v-if="props.replyMessage"
      type="button"
      class="message-reference-reply"
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

      <div class="message-reference-reply__content">
        <div class="message-reference-reply__author">{{ replyAuthor }}</div>
        <div class="message-reference-reply__text">{{ replyText }}</div>
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

const props =
  defineProps<
    Pick<IMessageBubbleProps, 'forwardUser' | 'replyMessage' | 'isMeSender'>
  >();

defineEmits(['navigate-message']);

const { getFullMediaPath } = useMessageMedia();

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

const replyText = computed(() => {
  const replyMessage = props.replyMessage;
  const previewMedia = replyPreviewMedia.value;

  if (!replyMessage) {
    return '';
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
