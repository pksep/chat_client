<template>
  <template v-if="mediaFiles.length > 0">
    <h5 v-if="props.forwardUser" class="message__article-forward-info">
      Переслано: от {{ props.forwardUser.initials }}
    </h5>
    <article
      :class="messageArticleStyles"
      :data-testid="`${props.dataTestid}-Article`"
    >
      <h3
        v-if="!props.isMeSender && !isDialogRoute"
        class="message__article-initals"
      >
        {{ props.sender }}
      </h3>
      <blockquote
        v-if="!!props.replyMessage"
        class="message-content__blockquote"
        :data-testid="`${props.dataTestid}-Blockquote`"
        @click="$emit('navigate-message')"
      >
        <div
          class="message-content__blockquote-container"
          :data-testid="`${props.dataTestid}-BlockquoteContainer`"
        >
          <h5 :data-testid="`${props.dataTestid}-BlockquoteAuthor`">
            {{ props.replyMessage?.senderUser?.initials || '' }}
          </h5>
          <p :data-testid="`${props.dataTestid}-BlockquoteText`">
            {{ stripHtml(props.replyMessage?.text || 'Вложение') }}
          </p>
        </div>
      </blockquote>
      <div
        :class="`message-content message-content-${mediaFiles.length}-item`"
        :data-testid="`${props.dataTestid}-Content`"
      >
        <div
          v-for="(media, i) in mediaFiles"
          :key="media.id"
          class="message-content__media"
          :data-testid="`${props.dataTestid}-MediaContainer`"
        >
          <video
            v-if="media.type === MediaType.Video && media.localPath"
            :src="getFullMediaPath(media)"
            :style="getPreviewStyle(media)"
            @loadedmetadata="captureVideoPreviewMetrics(media, $event)"
          />

          <img
            v-else
            :src="getFullMediaPath(media)"
            :alt="props.sender ? props.sender + ' image' : 'Shared image'"
            :style="getPreviewStyle(media)"
            @load="captureImagePreviewMetrics(media, $event)"
            @click="$emit('set-slider', mediaFiles, i)"
            @dragstart="handleDragStart($event, media)"
          />

          <div
            v-if="typeof media.isLoading === 'boolean'"
            class="message-content__media-loading"
          >
            <LoadingIcon
              :is-loaded="!media.isLoading"
              :percent="media.uploadPercent ?? null"
            />
          </div>

          <div
            v-else-if="media.type === MediaType.Video"
            class="message-content__media-video"
            @click="$emit('set-slider', mediaFiles, i)"
          >
            <PlayIcon />
          </div>
        </div>
      </div>

      <div v-if="!props.file" class="message-time">
        <MessageEmojies :reactions="props.reactions" />
        <PinIcon
          v-if="props.isPin"
          style="width: 15px; height: 15px; margin-right: -2px"
        />
        <span>{{ props.time }}</span>
        <MessageStatusIcons
          v-if="props.isMeSender"
          :is-read="props.isRead"
          :message-status="props.messageStatus"
        />
      </div>
    </article>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { MediaType } from '@pksep/zod-shared-chat';
import MessageStatusIcons from './MessageStatusIcons.vue';
import LoadingIcon from '../UI/LoadingIcon.vue';
import PlayIcon from '../UI/PlayIcon.vue';
import PinIcon from '../UI/PinIcon.vue';
import MessageEmojies from './MessageEmojies.vue';
import { stripHtml } from '../../utils/stripHtml';
import { useUrlWatcher } from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import { useMessageMedia } from './composables/useMessageMedia';
import type { IMessageBubbleProps } from './interface/interface';
import type { IMedia } from '../interfaces/interfaces';

const props = defineProps<IMessageBubbleProps>();

defineEmits(['navigate-message', 'set-slider']);

const { getFullMediaPath, handleDragStart } = useMessageMedia();

const route = useUrlWatcher();
const isDialogRoute = computed(() => route.value.type === RouteTypes.DIALOGS);

const mediaFiles = computed(
  () => props.media?.filter(media => media.type !== MediaType.File) || []
);

const getPreviewStyle = (media: IMedia): Record<string, string> => {
  if (!media.ex?.previewWidth || !media.ex?.previewHeight) {
    return {};
  }

  return {
    width: `${media.ex.previewWidth}px`,
    height: `${media.ex.previewHeight}px`
  };
};

const savePreviewMetrics = (
  media: IMedia,
  element: HTMLImageElement | HTMLVideoElement,
  naturalWidth?: number,
  naturalHeight?: number
): void => {
  const rect = element.getBoundingClientRect();

  media.ex = {
    ...media.ex,
    width: media.ex?.width || naturalWidth,
    height: media.ex?.height || naturalHeight,
    previewWidth: Math.round(rect.width),
    previewHeight: Math.round(rect.height)
  };
};

const captureImagePreviewMetrics = (media: IMedia, event: Event): void => {
  const image = event.currentTarget as HTMLImageElement | null;
  if (!image) return;

  savePreviewMetrics(media, image, image.naturalWidth, image.naturalHeight);
};

const captureVideoPreviewMetrics = (media: IMedia, event: Event): void => {
  const video = event.currentTarget as HTMLVideoElement | null;
  if (!video) return;

  savePreviewMetrics(media, video, video.videoWidth, video.videoHeight);
};

const messageArticleStyles = computed(() => [
  'message__article',
  {
    'message__no-author': props.isMeSender,
    message__article__media: true
  }
]);
</script>
