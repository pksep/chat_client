<template>
  <template v-if="docFiles.length > 0">
    <div class="message-file-stack">
      <div v-if="props.forwardUser" class="message-reference-forward">
        Переслано: от {{ props.forwardUser.initials }}
      </div>
      <article
        ref="filesArticleRef"
        :class="messageArticleStyles"
        :data-testid="`${props.dataTestid}-Article`"
      >
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
        <MessageReferenceBlock
          v-if="props.replyMessage"
          :reply-message="props.replyMessage"
          :message-ex="props.messageEx"
          :is-me-sender="props.isMeSender"
          :reference-width="replyReferenceWidth"
          @navigate-message="$emit('navigate-message')"
        />
        <div
          v-for="(media, i) in docFiles"
          :key="media.id"
          class="message-content"
          :data-testid="`${props.dataTestid}-Content`"
        >
          <div
            @click="handleFileClick(media, i)"
            :draggable="canDragMedia(media)"
            @dragstart.stop="handleDragStart($event, media)"
            @contextmenu.prevent
            class="message-content__file"
            :data-testid="`${props.dataTestid}-FileContainer`"
          >
            <span
              class="message-content__file-icon"
              @click.stop="handleFileClick(media, i)"
            >
              <FileIcon
                :is-me-sender="props.isMeSender"
                :dataTestid="`${props.dataTestid}-FileIcon`"
                :is-loaded="isFileIconLoaded(media)"
                :percent="getFileIconPercent(media)"
                :icon="getFileIconType(media)"
              />
            </span>
            <div :data-testid="`${props.dataTestid}-FileInfo`">
              <div :data-testid="`${props.dataTestid}-FileDetails`">
                <p
                  class="message-content__file__name"
                  :data-testid="`${props.dataTestid}-FileName`"
                >
                  {{ getShortName(media.originName) }}
                </p>
                <p
                  class="message-content__file__size"
                  :data-testid="`${props.dataTestid}-FileSize`"
                >
                  <template v-if="getFileUploadMeta(media)">
                    <span class="message-content__file__upload-percent">
                      {{ getFileUploadMeta(media)?.percent }}%
                    </span>
                    <span class="message-content__file__upload-separator">
                      ·
                    </span>
                    <span class="message-content__file__upload-size">
                      {{ getFileUploadMeta(media)?.size }}
                    </span>
                  </template>
                  <template v-else>
                    {{ getFileFormattedSize(media) }}
                  </template>
                </p>
              </div>
            </div>
          </div>
        </div>
        <div
          v-if="hasInlineCaption"
          class="message-file__caption message-content--text"
        >
          <div
            ref="messageHtmlRef"
            class="message-content__html"
            v-emoji
            v-html="safeMessageHtml"
            :data-testid="`${props.dataTestid}-MessageText`"
            @click="handleMentionUserClick"
          ></div>
          <div
            v-if="!hasReactions"
            class="message-time message-time--inline"
            :data-testid="`${props.dataTestid}-Time`"
          >
            <PinIcon
              style="width: 15px; height: 15px; margin-right: -2px"
              v-if="props.isPin"
            />
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
          class="message-time"
          v-if="
            !props.loader && !props.file && !hasReactions && !hasInlineCaption
          "
          :data-testid="`${props.dataTestid}-Time`"
        >
          <PinIcon
            style="width: 15px; height: 15px; margin-right: -2px"
            v-if="props.isPin"
          />
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
        <div v-if="props.reactions?.length" class="message-footer-row">
          <div class="message-reactions-row">
            <MessageEmojies :reactions="props.reactions" />
          </div>
          <div
            class="message-time message-time--bottom"
            v-if="!props.loader && !props.file"
            :data-testid="`${props.dataTestid}-Time`"
          >
            <PinIcon
              style="width: 15px; height: 15px; margin-right: -2px"
              v-if="props.isPin"
            />
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
      </article>
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { IMessageBubbleProps } from './interface/interface';
import { MediaType } from '@pksep/zod-shared-chat';
import MessageStatusIcons from './MessageStatusIcons.vue';
import FileIcon from '../UI/FileIcon.vue';
import PinIcon from '../UI/PinIcon.vue';
import MessageEmojies from './MessageEmojies.vue';
import ErrorIcon from '../UI/ErrorIcon.vue';
import { getFormatFileSize, getShortName } from '../../utils/getFormatFileSize';
import { useMessageMedia } from './composables/useMessageMedia';
import { useReferenceWidth } from './composables/useReferenceWidth';
import MessageReferenceBlock from './MessageReferenceBlock.vue';
import MessageBubbleTail from './MessageBubbleTail.vue';
import { stripHtml } from '../../utils/stripHtml';
import MessageAuthorMeta from './MessageAuthorMeta.vue';
import {
  hasMessageInteractivityCandidates,
  useMentionUserClick
} from './composables/useMentionUserClick';
import { MessageStatus } from '../../services/useChatSDK/types';
import { observeViewportVisibility } from '../../services/useSharedViewportObserver';
import type { IMedia } from '../interfaces/interfaces';
import {
  getNativeFileDownloadState,
  isNativeFileDownloadSupported,
  refreshNativeFileDownloadStatus
} from '../../services/useNativeFile';
import { sanitizeMessageHtml } from '../../utils/sanitizeMessageHtml';

const props = defineProps<IMessageBubbleProps>();
const safeMessageHtml = computed(() => sanitizeMessageHtml(props.message));

const emits = defineEmits(['navigate-message', 'set-slider']);
const { primeMediaCache, isSliderContentUrl, handleDragStart, canDragMedia } =
  useMessageMedia();

const messageHtmlRef = ref<HTMLElement | null>(null);
const { handleMentionUserClick, syncMentionUserInteractivity } =
  useMentionUserClick();
const filesArticleRef = ref<HTMLElement | null>(null);
const hasReplyReference = computed(() => Boolean(props.replyMessage));
const replyReferenceWidth = useReferenceWidth(filesArticleRef, {
  freezeAfterFirstMeasure: true,
  enabled: hasReplyReference
});
const shouldPrimeFiles = ref(false);
let stopObservingFilesVisibility: (() => void) | null = null;

const docFiles = computed(
  () => props.media?.filter(media => media.type === MediaType.File) || []
);
const hasCaption = computed(() =>
  Boolean(stripHtml(props.message || '').trim())
);
const hasMediaFiles = computed(() =>
  Boolean(props.media?.some(media => media.type !== MediaType.File))
);
const hasInlineCaption = computed(
  () => hasCaption.value && !hasMediaFiles.value
);

const syncMentions = async (): Promise<void> => {
  if (!hasMessageInteractivityCandidates(props.message)) {
    return;
  }

  await nextTick();
  syncMentionUserInteractivity(messageHtmlRef.value);
};

const syncNativeFileStatuses = (): void => {
  if (!isNativeFileDownloadSupported()) {
    return;
  }

  docFiles.value.forEach(media => {
    if (
      media.isLoading ||
      media.uploadError ||
      !media.path ||
      isSliderContentFile(media)
    ) {
      return;
    }

    void refreshNativeFileDownloadStatus(media);
  });
};

const filePrimeIdentity = computed(() =>
  docFiles.value
    .map(
      media =>
        `${media.id || ''}:${media.path || ''}:${media.thumbnailPath || ''}`
    )
    .join('\u001f')
);
const nativeFileStatusIdentity = computed(() =>
  docFiles.value
    .map(
      media =>
        `${media.id || ''}:${media.path || ''}:${media.type}:${media.isLoading ? 1 : 0}:${media.uploadError ? 1 : 0}`
    )
    .join('\u001f')
);

watch(
  [filePrimeIdentity, shouldPrimeFiles],
  () => {
    if (!shouldPrimeFiles.value) {
      return;
    }

    docFiles.value.forEach(media => {
      primeMediaCache(media, { includeOriginal: true });
    });
  },
  { immediate: true }
);

watch(
  () => props.message,
  () => {
    void syncMentions();
  },
  { immediate: true }
);

watch(nativeFileStatusIdentity, syncNativeFileStatuses, { immediate: true });

onMounted(() => {
  if (filesArticleRef.value) {
    stopObservingFilesVisibility = observeViewportVisibility(
      filesArticleRef.value,
      isVisible => {
        if (!isVisible) {
          return;
        }

        shouldPrimeFiles.value = true;
        stopObservingFilesVisibility?.();
        stopObservingFilesVisibility = null;
      },
      { rootMargin: '250px 0px' }
    );
  }
});

onUnmounted(() => {
  stopObservingFilesVisibility?.();
  stopObservingFilesVisibility = null;
});

const showErrorIcon = computed(
  () => props.messageStatus === MessageStatus.NotDelivered
);
const hasReactions = computed(() => Boolean(props.reactions?.length));

const shouldShowFileLoading = (media: IMedia): boolean =>
  Boolean(
    media.isLoading ||
      (media.uploadError && props.messageStatus !== MessageStatus.NotDelivered)
  );

const getSliderDetectionValue = (media: IMedia): string =>
  media.originName || media.path || '';

const isSliderContentFile = (media: IMedia): boolean =>
  isSliderContentUrl(getSliderDetectionValue(media), {
    includePdf: !isNativeFileDownloadSupported()
  });

const shouldUseNativeFileState = (media: IMedia): boolean =>
  Boolean(
    isNativeFileDownloadSupported() &&
      media.path &&
      !media.isLoading &&
      !media.uploadError &&
      !isSliderContentFile(media)
  );

const isNativeFileDownloading = (media: IMedia): boolean =>
  shouldUseNativeFileState(media) &&
  getNativeFileDownloadState(media).phase === 'downloading';

const isFileIconLoaded = (media: IMedia): boolean =>
  !shouldShowFileLoading(media) && !isNativeFileDownloading(media);

const getFileIconPercent = (media: IMedia): number | null => {
  if (isNativeFileDownloading(media)) {
    return getNativeFileDownloadState(media).percent;
  }

  return media.isLoading ? media.uploadPercent ?? null : null;
};

type FileUploadMeta = {
  percent: number;
  size: string;
};

const getFileFormattedSize = (media: IMedia): string =>
  getFormatFileSize(media.size);

const getFileUploadMeta = (media: IMedia): FileUploadMeta | null => {
  const percent = getFileIconPercent(media);

  if (
    !media.isLoading ||
    typeof percent !== 'number' ||
    !Number.isFinite(percent)
  ) {
    return null;
  }

  return {
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    size: getFileFormattedSize(media)
  };
};

const getFileIconType = (media: IMedia): 'file' | 'download' => {
  if (!shouldUseNativeFileState(media)) {
    return 'file';
  }

  return getNativeFileDownloadState(media).phase === 'downloaded'
    ? 'file'
    : 'download';
};

const handleFileClick = (media: IMedia, index: number) => {
  if (media.uploadError || !media.path) {
    return;
  }

  emits('set-slider', docFiles.value, index);
};

const messageArticleStyles = computed(() => [
  'message__article',
  {
    'message__no-author': props.isMeSender,
    message__article__file: true,
    'message__article__file--caption': hasInlineCaption.value
  }
]);
</script>
