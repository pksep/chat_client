<template>
  <template v-if="mediaFiles.length > 0">
    <h5 v-if="props.forwardUser" class="message__article-forward-info">
      Переслано: от {{ props.forwardUser.initials }}
    </h5>
    <article
      ref="mediaArticleRef"
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
          @contextmenu.prevent
        >
          <img
            :src="shouldLoadMedia ? getFullMediaPath(media) : EMPTY_MEDIA_SRC"
            :alt="props.sender ? props.sender + ' image' : 'Shared image'"
            :style="getPreviewStyle(media)"
            loading="lazy"
            decoding="async"
            @load="captureImagePreviewMetrics(media, $event)"
            @click="$emit('set-slider', mediaFiles, i)"
            @dragstart="handleDragStart($event, media)"
            @contextmenu.prevent
          />

          <div
            v-if="typeof media.isLoading === 'boolean' || media.uploadError"
            class="message-content__media-loading"
          >
            <LoadingIcon
              v-if="!media.uploadError"
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
        <ErrorIcon v-if="showErrorIcon" />
        <MessageStatusIcons
          v-if="props.isMeSender && !showErrorIcon"
          :is-read="props.isRead"
          :message-status="props.messageStatus"
        />
      </div>
    </article>
  </template>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { MediaType } from '@pksep/zod-shared-chat';
import MessageStatusIcons from './MessageStatusIcons.vue';
import LoadingIcon from '../UI/LoadingIcon.vue';
import PlayIcon from '../UI/PlayIcon.vue';
import PinIcon from '../UI/PinIcon.vue';
import MessageEmojies from './MessageEmojies.vue';
import ErrorIcon from '../UI/ErrorIcon.vue';
import { stripHtml } from '../../utils/stripHtml';
import { useUrlWatcher } from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import { useMessageMedia } from './composables/useMessageMedia';
import type { IMessageBubbleProps } from './interface/interface';
import type { IMedia } from '../interfaces/interfaces';

const props = defineProps<IMessageBubbleProps>();
defineEmits(['navigate-message', 'set-slider']);

const { getFullMediaPath, handleDragStart, primeMediaCache, isMediaPathReady, EMPTY_MEDIA_SRC } =
  useMessageMedia();

const route = useUrlWatcher();
const isDialogRoute = computed(() => route.value.type === RouteTypes.DIALOGS);

const mediaFiles = computed(
  () => props.media?.filter(media => media.type !== MediaType.File) || []
);
const mediaArticleRef = ref<HTMLElement | null>(null);
const shouldLoadMedia = ref(false);
let visibilityObserver: IntersectionObserver | null = null;

const isNearViewport = (element: HTMLElement, offset = 250) => {
  const rect = element.getBoundingClientRect();

  return rect.bottom >= -offset && rect.top <= window.innerHeight + offset;
};

watch(
  [mediaFiles, shouldLoadMedia],
  ([medias]) => {
    if (!shouldLoadMedia.value) {
      return;
    }

    medias.forEach(media => {
      primeMediaCache(media, {
        includeOriginal: media.type === MediaType.Video
      });
    });
  },
  {
    immediate: true,
    deep: true
  }
);

onMounted(() => {
  if (
    mediaArticleRef.value &&
    isNearViewport(mediaArticleRef.value) &&
    mediaFiles.value.some(media => isMediaPathReady(media))
  ) {
    shouldLoadMedia.value = true;
    return;
  }

  if (!('IntersectionObserver' in window)) {
    shouldLoadMedia.value = true;
    return;
  }

  visibilityObserver = new IntersectionObserver(
    entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        shouldLoadMedia.value = true;
        visibilityObserver?.disconnect();
        visibilityObserver = null;
      }
    },
    {
      root: null,
      rootMargin: '250px 0px',
      threshold: 0.01
    }
  );

  if (mediaArticleRef.value) {
    visibilityObserver.observe(mediaArticleRef.value);
  }
});

onUnmounted(() => {
  visibilityObserver?.disconnect();
  visibilityObserver = null;
});

const showErrorIcon = computed(
  () =>
    props.messageStatus === 'NOT_DELIVERED' ||
    mediaFiles.value.some(media => media.uploadError)
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

const messageArticleStyles = computed(() => [
  'message__article',
  {
    'message__no-author': props.isMeSender,
    message__article__media: true
  }
]);
</script>
