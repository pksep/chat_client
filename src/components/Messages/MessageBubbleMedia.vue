<template>
  <template v-if="mediaFiles.length > 0">
    <div class="message-bubble-stack">
      <article
        ref="mediaArticleRef"
        :class="messageArticleStyles"
        :style="articleInlineStyle"
        :data-testid="`${props.dataTestid}-Article`"
      >
        <MessageAuthorMeta
          v-if="
            !props.isMeSender && !isDialogRoute && !props.continuesFromPrevious
          "
          :sender="props.sender"
          :sender-user="props.senderUser"
          :sender-role="props.senderRole"
          :data-testid="`${props.dataTestid}-AuthorMeta`"
        />
        <MessageReferenceBlock
          :forward-user="props.forwardUser"
          :reply-message="props.replyMessage"
          :message-ex="props.messageEx"
          :is-me-sender="props.isMeSender"
          :reference-width="replyReferenceWidth"
          :defer-until-measured="true"
          @navigate-message="$emit('navigate-message')"
        />
        <div
          :class="[
            {
              'message-content--media-with-caption-container': hasInlineCaption
            }
          ]"
          @click.stop="$emit('set-slider', mediaFiles, 0)"
        >
          <div
            :class="[
              `message-content message-content-${mediaFiles.length}-item`,
              'message-content--media',
              { 'message-content--media-with-caption': hasInlineCaption }
            ]"
            :data-testid="`${props.dataTestid}-Content`"
          >
            <div
              v-for="(media, i) in mediaFiles"
              :key="media.id"
              class="message-content__media"
              :style="getPreviewContainerStyle(media, i)"
              :data-testid="`${props.dataTestid}-MediaContainer`"
              @contextmenu.prevent
            >
              <video
                v-if="shouldRenderLocalVideoPreview(media)"
                :src="media.localPath"
                :poster="media.localThumbnailPath || VIDEO_FALLBACK_THUMBNAIL"
                :style="getPreviewStyle()"
                :width="getPreviewWidth(media, i)"
                :height="getPreviewHeight(media, i)"
                muted
                playsinline
                preload="metadata"
                draggable="true"
                @loadedmetadata="prepareLocalVideoPreview(media, $event)"
                @loadeddata="captureVideoPreviewMetrics(media, $event)"
                @dragstart="handleMediaImageDragStart"
                @click.stop="handleMediaClick(i)"
                @contextmenu.prevent
              />

              <div
                v-else-if="!shouldLoadMedia"
                class="message-content__media-placeholder"
                :style="getPreviewStyle()"
                aria-hidden="true"
                @click.stop="handleMediaClick(i)"
                @contextmenu.prevent
              />

              <img
                v-else
                :src="getFeedMediaPath(media)"
                :alt="
                  props.sender ? `${props.sender} изображение` : 'Изображение'
                "
                :style="getPreviewStyle()"
                :width="getPreviewWidth(media, i)"
                :height="getPreviewHeight(media, i)"
                loading="lazy"
                fetchpriority="low"
                decoding="async"
                draggable="true"
                @load="captureImagePreviewMetrics(media, $event)"
                @dragstart="handleMediaImageDragStart"
                @click.stop="handleMediaClick(i)"
                @contextmenu.prevent
              />

              <div
                v-if="shouldShowMediaLoading(media)"
                class="message-content__media-loading"
              >
                <LoadingIcon
                  :is-loaded="false"
                  :percent="
                    media.isLoading ? media.uploadPercent ?? null : null
                  "
                />
              </div>

              <div
                v-else-if="media.type === MediaType.Video"
                class="message-content__media-video"
                @click="$emit('set-slider', mediaFiles, i)"
              >
                <PlayIcon />
              </div>

              <div
                v-if="i === mediaFiles.length - 1 && !hasInlineCaption"
                class="message-content__media-overlay-time"
              >
                <span>{{ props.time }}</span>
                <ErrorIcon v-if="showErrorIcon" />
                <MessageStatusIcons
                  v-if="props.isMeSender && !showErrorIcon"
                  :is-read="props.isRead"
                  :message-status="props.messageStatus"
                />
              </div>
            </div>
          </div>
        </div>
        <div
          v-if="hasInlineCaption"
          class="message-media__caption message-content--text"
        >
          <div
            ref="messageHtmlRef"
            class="message-media__caption-text message-content__html"
            v-emoji
            v-html="props.message"
            :data-testid="`${props.dataTestid}-MessageText`"
            @click="handleMentionUserClick"
          ></div>
          <div
            v-if="!hasReactions"
            class="message-time message-time--inline message-media__caption-time"
            :data-testid="`${props.dataTestid}-Time`"
          >
            <span>{{ props.time }}</span>
            <ErrorIcon v-if="showErrorIcon" />
            <MessageStatusIcons
              v-if="props.isMeSender && !showErrorIcon"
              :is-read="props.isRead"
              :message-status="props.messageStatus"
            />
          </div>
          <div v-else class="message-footer-row message-media__caption-footer">
            <div class="message-reactions-row">
              <MessageEmojies :reactions="props.reactions" />
            </div>
            <div
              class="message-time message-time--bottom message-media__caption-time"
              :data-testid="`${props.dataTestid}-Time`"
            >
              <span>{{ props.time }}</span>
              <ErrorIcon v-if="showErrorIcon" />
              <MessageStatusIcons
                v-if="props.isMeSender && !showErrorIcon"
                :is-read="props.isRead"
                :message-status="props.messageStatus"
              />
            </div>
          </div>
        </div>
      </article>

      <div
        v-if="props.reactions?.length && !hasInlineCaption"
        class="message-footer-row"
      >
        <div class="message-reactions-row">
          <MessageEmojies :reactions="props.reactions" />
        </div>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { MediaType } from '@pksep/zod-shared-chat';
import MessageStatusIcons from './MessageStatusIcons.vue';
import LoadingIcon from '../UI/LoadingIcon.vue';
import PlayIcon from '../UI/PlayIcon.vue';
import MessageEmojies from './MessageEmojies.vue';
import ErrorIcon from '../UI/ErrorIcon.vue';
import { stripHtml } from '../../utils/stripHtml';
import { useUrlWatcher } from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import { useMessageMedia } from './composables/useMessageMedia';
import { useReferenceWidth } from './composables/useReferenceWidth';
import type { IMessageBubbleProps } from './interface/interface';
import type { IMedia } from '../interfaces/interfaces';
import MessageReferenceBlock from './MessageReferenceBlock.vue';
import MessageAuthorMeta from './MessageAuthorMeta.vue';
import { useMentionUserClick } from './composables/useMentionUserClick';
import { MessageStatus } from '../../services/useChatSDK/types';
import {
  calculatePreviewDimensions,
  getGridItemMaxWidth,
  normalizePreviewDimensions,
  type MediaPreviewDimensions,
  PREVIEW_MAX_HEIGHT,
  PREVIEW_MIN_SIZE,
  VIDEO_FALLBACK_THUMBNAIL
} from '../../utils/mediaPreview';

const props = defineProps<IMessageBubbleProps>();
const emit = defineEmits(['navigate-message', 'set-slider']);

const { getFullMediaPath, primeMediaCache } = useMessageMedia();

const route = useUrlWatcher();
const isDialogRoute = computed(() => route.value.type === RouteTypes.DIALOGS);
const messageHtmlRef = ref<HTMLElement | null>(null);
const { handleMentionUserClick, syncMentionUserInteractivity } =
  useMentionUserClick();

const mediaFiles = computed(
  () => props.media?.filter(media => media.type !== MediaType.File) || []
);
const hasCaption = computed(() =>
  Boolean(stripHtml(props.message || '').trim())
);
const hasInlineCaption = computed(() => hasCaption.value);
const hasTopMeta = computed(
  () =>
    Boolean(props.replyMessage) ||
    (!props.isMeSender && !isDialogRoute.value && !props.continuesFromPrevious)
);
const hasReactions = computed(() => Boolean(props.reactions?.length));
const singleMediaPreviewWidth = computed(() => {
  if (mediaFiles.value.length !== 1) {
    return null;
  }

  const media = mediaFiles.value[0];
  let preview: MediaPreviewDimensions | null = null;

  if (media?.ex?.previewWidth && media.ex?.previewHeight) {
    preview = normalizePreviewDimensions(media.ex, 1, 0);
  } else if (media?.ex) {
    preview = calculatePreviewDimensions(media.ex, 1, 0);
  }

  const width = preview?.previewWidth;

  return typeof width === 'number' && width > 0 ? width : null;
});
const articleInlineStyle = computed(() => {
  if (!hasInlineCaption.value || !singleMediaPreviewWidth.value) {
    return undefined;
  }

  return {
    minWidth: `${singleMediaPreviewWidth.value}px`
  };
});
const mediaArticleRef = ref<HTMLElement | null>(null);
const syncMentions = async (): Promise<void> => {
  await nextTick();
  syncMentionUserInteractivity(messageHtmlRef.value);
};
const replyReferenceWidth = useReferenceWidth(mediaArticleRef, {
  freezeAfterFirstMeasure: true
});
const shouldLoadMedia = ref(false);
let visibilityObserver: IntersectionObserver | null = null;
let lastMediaDragStartedAt = 0;
const MEDIA_LOAD_ROOT_MARGIN_PX = 900;

const isNearViewport = (
  element: HTMLElement,
  offset = MEDIA_LOAD_ROOT_MARGIN_PX
) => {
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
      if (media.type === MediaType.Video && !media.thumbnailPath) {
        return;
      }

      primeMediaCache(media);
    });
  },
  {
    immediate: true
  }
);

watch(
  () => props.message,
  () => {
    void syncMentions();
  },
  { immediate: true }
);

onMounted(() => {
  void syncMentions();

  if (!('IntersectionObserver' in window)) {
    shouldLoadMedia.value = true;
    return;
  }

  if (mediaArticleRef.value) {
    shouldLoadMedia.value = isNearViewport(mediaArticleRef.value);
  }

  visibilityObserver = new IntersectionObserver(
    entries => {
      shouldLoadMedia.value = entries.some(entry => entry.isIntersecting);
    },
    {
      root: null,
      rootMargin: `${MEDIA_LOAD_ROOT_MARGIN_PX}px 0px`,
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
  () => props.messageStatus === MessageStatus.NotDelivered
);

const shouldShowMediaLoading = (media: IMedia): boolean =>
  Boolean(
    media.isLoading ||
      (media.uploadError && props.messageStatus !== MessageStatus.NotDelivered)
  );

const shouldRenderLocalVideoPreview = (media: IMedia): boolean =>
  Boolean(
    media.type === MediaType.Video &&
      media.isLoading &&
      media.localPath &&
      (!media.localThumbnailPath ||
        media.localThumbnailPath === VIDEO_FALLBACK_THUMBNAIL)
  );

const getFallbackPreviewDimensions = (
  media: IMedia,
  index: number
): MediaPreviewDimensions => {
  const mediaCount = mediaFiles.value.length;
  const previewWidth = Math.round(getGridItemMaxWidth(mediaCount, index));
  const isSingleMedia = mediaCount === 1;
  const fallbackRatio =
    media.type === MediaType.Video ? 16 / 9 : isSingleMedia ? 4 / 3 : 1;
  const minHeight = Math.min(PREVIEW_MIN_SIZE, previewWidth);
  const previewHeight = Math.round(
    Math.min(
      PREVIEW_MAX_HEIGHT,
      Math.max(minHeight, previewWidth / fallbackRatio)
    )
  );

  return {
    previewWidth,
    previewHeight,
    fillPreview: true
  };
};

const getPreviewDimensions = (media: IMedia, index: number) => {
  const preview = normalizePreviewDimensions(
    media.ex?.previewWidth && media.ex?.previewHeight
      ? media.ex
      : calculatePreviewDimensions(
          media.ex || {},
          mediaFiles.value.length,
          index
        ),
    mediaFiles.value.length,
    index
  );

  return preview.previewWidth && preview.previewHeight
    ? preview
    : getFallbackPreviewDimensions(media, index);
};

const getPreviewWidth = (media: IMedia, index: number): number | undefined => {
  const width = getPreviewDimensions(media, index).previewWidth;
  return typeof width === 'number' && width > 0 ? width : undefined;
};

const getPreviewHeight = (media: IMedia, index: number): number | undefined => {
  const height = getPreviewDimensions(media, index).previewHeight;
  return typeof height === 'number' && height > 0 ? height : undefined;
};

const getPreviewStyle = (): Record<string, string> => {
  return {
    width: '100%',
    height: '100%'
  };
};

const getPreviewContainerStyle = (
  media: IMedia,
  index: number
): Record<string, string> => {
  const preview = getPreviewDimensions(media, index);
  const previewWidth = preview.previewWidth;
  const previewHeight = preview.previewHeight;

  if (!previewWidth || !previewHeight) {
    return {};
  }

  if (mediaFiles.value.length === 1) {
    return {
      width: `${previewWidth}px`,
      height: `${previewHeight}px`,
      aspectRatio: `${previewWidth} / ${previewHeight}`,
      containIntrinsicSize: `${previewWidth}px ${previewHeight}px`,
      minHeight: `${previewHeight}px`
    };
  }

  return {
    width: '100%',
    height: `${previewHeight}px`,
    aspectRatio: `${previewWidth} / ${previewHeight}`,
    containIntrinsicSize: `${previewWidth}px ${previewHeight}px`,
    minHeight: `${previewHeight}px`
  };
};

const getFeedMediaPath = (media: IMedia): string => {
  if (media.type !== MediaType.Video) {
    return getFullMediaPath(media);
  }

  if (media.localThumbnailPath) {
    return media.localThumbnailPath;
  }

  if (media.thumbnailPath) {
    return getFullMediaPath(media);
  }

  return VIDEO_FALLBACK_THUMBNAIL;
};

const savePreviewMetrics = (
  media: IMedia,
  element: HTMLImageElement | HTMLVideoElement,
  naturalWidth?: number,
  naturalHeight?: number
): void => {
  if (
    media.ex?.previewWidth &&
    media.ex?.previewHeight &&
    media.ex?.width &&
    media.ex?.height
  ) {
    return;
  }

  const rect = element.getBoundingClientRect();
  const nextMetrics = {
    width: media.ex?.width || naturalWidth,
    height: media.ex?.height || naturalHeight,
    previewWidth: Math.round(rect.width),
    previewHeight: Math.round(rect.height)
  };

  if (
    media.ex?.width === nextMetrics.width &&
    media.ex?.height === nextMetrics.height &&
    media.ex?.previewWidth === nextMetrics.previewWidth &&
    media.ex?.previewHeight === nextMetrics.previewHeight
  ) {
    return;
  }

  media.ex = {
    ...media.ex,
    ...nextMetrics
  };
};

const captureImagePreviewMetrics = (media: IMedia, event: Event): void => {
  const image = event.currentTarget as HTMLImageElement | null;
  if (!image) return;

  savePreviewMetrics(media, image, image.naturalWidth, image.naturalHeight);
};

const prepareLocalVideoPreview = (media: IMedia, event: Event): void => {
  const video = event.currentTarget as HTMLVideoElement | null;
  if (!video) return;

  savePreviewMetrics(media, video, video.videoWidth, video.videoHeight);

  if (!Number.isFinite(video.duration) || video.duration <= 0.1) {
    return;
  }

  try {
    video.currentTime = Math.min(0.1, video.duration - 0.05);
  } catch {
    // Some Firefox codecs reject early seeks; the native poster frame is enough.
  }
};

const captureVideoPreviewMetrics = (media: IMedia, event: Event): void => {
  const video = event.currentTarget as HTMLVideoElement | null;
  if (!video) return;

  savePreviewMetrics(media, video, video.videoWidth, video.videoHeight);
};

const handleMediaClick = (index: number): void => {
  if (Date.now() - lastMediaDragStartedAt < 350) {
    return;
  }

  emit('set-slider', mediaFiles.value, index);
};

const handleMediaImageDragStart = (event: DragEvent): void => {
  lastMediaDragStartedAt = Date.now();
  const element = event.currentTarget as HTMLElement | null;
  const dataTransfer = event.dataTransfer;

  if (!element || !dataTransfer) {
    return;
  }

  const rect = element.getBoundingClientRect();
  const clone = element.cloneNode(false) as HTMLElement;

  clone.removeAttribute('id');
  clone.style.position = 'fixed';
  clone.style.left = '-10000px';
  clone.style.top = '-10000px';
  clone.style.width = `${Math.round(rect.width)}px`;
  clone.style.height = `${Math.round(rect.height)}px`;
  clone.style.objectFit = getComputedStyle(element).objectFit;
  clone.style.pointerEvents = 'none';

  document.body.appendChild(clone);
  dataTransfer.setDragImage(clone, rect.width / 2, rect.height / 2);
  requestAnimationFrame(() => clone.remove());
};

const messageArticleStyles = computed(() => [
  'message__article',
  {
    'message__no-author': props.isMeSender,
    message__article__media: true,
    'message__article__media--caption': hasInlineCaption.value,
    'message__article__media--with-top-meta': hasTopMeta.value
  }
]);
</script>
