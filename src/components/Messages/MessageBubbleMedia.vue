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
              :data-testid="`${props.dataTestid}-MediaContainer`"
              @contextmenu.prevent
            >
              <img
                :src="
                  shouldLoadMedia ? getFullMediaPath(media) : EMPTY_MEDIA_SRC
                "
                :alt="
                  props.sender ? `${props.sender} изображение` : 'Изображение'
                "
                :style="getPreviewStyle(media, i)"
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

      <Transition name="reaction-row">
        <div
          v-if="props.reactions?.length && !hasInlineCaption"
          class="message-footer-row"
        >
          <div class="message-reactions-row">
            <MessageEmojies :reactions="props.reactions" />
          </div>
        </div>
      </Transition>
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
import { calculatePreviewDimensions } from '../../utils/mediaPreview';

const props = defineProps<IMessageBubbleProps>();
const emit = defineEmits(['navigate-message', 'set-slider']);

const { getFullMediaPath, primeMediaCache, isMediaPathReady, EMPTY_MEDIA_SRC } =
  useMessageMedia();

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

  const width = mediaFiles.value[0]?.ex?.previewWidth;

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

watch(
  () => props.message,
  () => {
    void syncMentions();
  },
  { immediate: true }
);

onMounted(() => {
  void syncMentions();

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
  () => props.messageStatus === MessageStatus.NotDelivered
);

const shouldShowMediaLoading = (media: IMedia): boolean =>
  Boolean(
    media.isLoading ||
      (media.uploadError && props.messageStatus !== MessageStatus.NotDelivered)
  );

const getPreviewStyle = (
  media: IMedia,
  index: number
): Record<string, string> => {
  const preview =
    media.ex?.previewWidth && media.ex?.previewHeight
      ? media.ex
      : calculatePreviewDimensions(
          media.ex || {},
          mediaFiles.value.length,
          index
        );

  if (!preview.previewWidth || !preview.previewHeight) {
    return {
      width: `100%`,
      height: `100%`
    };
  }

  return {
    width: `${preview.previewWidth}px`,
    height: `${preview.previewHeight}px`
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

const handleMediaClick = (index: number): void => {
  if (Date.now() - lastMediaDragStartedAt < 350) {
    return;
  }

  emit('set-slider', mediaFiles.value, index);
};

const handleMediaImageDragStart = (event: DragEvent): void => {
  lastMediaDragStartedAt = Date.now();
  const image = event.currentTarget as HTMLImageElement | null;
  const dataTransfer = event.dataTransfer;

  if (!image || !dataTransfer) {
    return;
  }

  const rect = image.getBoundingClientRect();
  const clone = image.cloneNode(false) as HTMLImageElement;

  clone.removeAttribute('id');
  clone.style.position = 'fixed';
  clone.style.left = '-10000px';
  clone.style.top = '-10000px';
  clone.style.width = `${Math.round(rect.width)}px`;
  clone.style.height = `${Math.round(rect.height)}px`;
  clone.style.objectFit = getComputedStyle(image).objectFit;
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
