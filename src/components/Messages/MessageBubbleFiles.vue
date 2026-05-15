<template>
  <template v-if="docFiles.length > 0">
    <div class="message-file-stack">
      <div v-if="props.forwardUser" class="message-reference-forward">
        {{ forwardedLabel }} {{ props.forwardUser.initials }}
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
            !props.isMeSender && !isDialogRoute && !props.continuesFromPrevious
          "
          :sender="props.sender"
          :sender-role="props.senderRole"
          :data-testid="`${props.dataTestid}-AuthorMeta`"
        />
        <MessageReferenceBlock
          :reply-message="props.replyMessage"
          :is-me-sender="props.isMeSender"
          @navigate-message="$emit('navigate-message')"
        />
        <div
          v-for="(media, i) in docFiles"
          :key="media.id"
          class="message-content"
          :data-testid="`${props.dataTestid}-Content`"
        >
          <div
            class="message-content__file"
            :data-testid="`${props.dataTestid}-FileContainer`"
            @click="handleFileClick(media, i)"
            @contextmenu.prevent
          >
            <FileIcon
              :is-me-sender="props.isMeSender"
              :dataTestid="`${props.dataTestid}-FileIcon`"
              :is-loaded="!media.isLoading && !media.isDownloading"
              :percent="media.uploadPercent ?? null"
            />
            <div :data-testid="`${props.dataTestid}-FileInfo`">
              <div :data-testid="`${props.dataTestid}-FileDetails`">
                <p
                  class="message-content__file__name"
                  :data-testid="`${props.dataTestid}-FileName`"
                >
                  {{ getDownloadFileName(media.originName) }}
                </p>
                <p
                  class="message-content__file__size"
                  :data-testid="`${props.dataTestid}-FileSize`"
                >
                  {{ getFormatFileSize(media.size) }}
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
          v-if="
            !props.loader && !props.file && !hasReactions && !hasInlineCaption
          "
          class="message-time"
          :data-testid="`${props.dataTestid}-Time`"
        >
          <PinIcon
            v-if="props.isPin"
            style="width: 15px; height: 15px; margin-right: -2px"
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
        <Transition name="reaction-row">
          <div v-if="props.reactions?.length" class="message-footer-row">
            <div class="message-reactions-row">
              <MessageEmojies :reactions="props.reactions" />
            </div>
            <div
              v-if="!props.loader && !props.file"
              class="message-time message-time--bottom"
              :data-testid="`${props.dataTestid}-Time`"
            >
              <PinIcon
                v-if="props.isPin"
                style="width: 15px; height: 15px; margin-right: -2px"
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
        </Transition>
      </article>
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { MediaType } from '@pksep/zod-shared-chat';
import type { IMessageBubbleProps } from './interface/interface';
import MessageStatusIcons from './MessageStatusIcons.vue';
import FileIcon from '../UI/FileIcon.vue';
import PinIcon from '../UI/PinIcon.vue';
import MessageEmojies from './MessageEmojies.vue';
import ErrorIcon from '../UI/ErrorIcon.vue';
import { getFormatFileSize } from '../../utils/getFormatFileSize';
import { useUrlWatcher } from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import { useMessageMedia } from './composables/useMessageMedia';
import MessageReferenceBlock from './MessageReferenceBlock.vue';
import MessageBubbleTail from './MessageBubbleTail.vue';
import { stripHtml } from '../../utils/stripHtml';
import MessageAuthorMeta from './MessageAuthorMeta.vue';
import {
  downloadMessageFile,
  getDownloadFileName
} from '../../services/useFileDownload';
import { showErrorNotification } from '../../composables/useNotifications';

const props = defineProps<IMessageBubbleProps>();

const emits = defineEmits(['navigate-message', 'set-slider']);
const { isSliderContentUrl, primeMediaCache } = useMessageMedia();
const forwardedLabel =
  '\u041f\u0435\u0440\u0435\u0441\u043b\u0430\u043d\u043e: \u043e\u0442';
const downloadFailedNotificationText =
  '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043a\u0430\u0447\u0430\u0442\u044c \u0444\u0430\u0439\u043b';

const route = useUrlWatcher();
const isDialogRoute = computed(() => route.value.type === RouteTypes.DIALOGS);
const filesArticleRef = ref<HTMLElement | null>(null);
const shouldPrimeFiles = ref(false);
let filesVisibilityObserver: IntersectionObserver | null = null;
const downloadFeedbackTimeouts = new Map<
  string,
  ReturnType<typeof setTimeout>
>();

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

watch(
  [docFiles, shouldPrimeFiles],
  ([medias]) => {
    if (!shouldPrimeFiles.value) {
      return;
    }

    medias.forEach(media => {
      primeMediaCache(media, { includeOriginal: true });
    });
  },
  {
    immediate: true,
    deep: true
  }
);

onMounted(() => {
  if (!('IntersectionObserver' in window)) {
    shouldPrimeFiles.value = true;
    return;
  }

  filesVisibilityObserver = new IntersectionObserver(
    entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        shouldPrimeFiles.value = true;
        filesVisibilityObserver?.disconnect();
        filesVisibilityObserver = null;
      }
    },
    {
      root: null,
      rootMargin: '250px 0px',
      threshold: 0.01
    }
  );

  if (filesArticleRef.value) {
    filesVisibilityObserver.observe(filesArticleRef.value);
  }
});

onUnmounted(() => {
  filesVisibilityObserver?.disconnect();
  filesVisibilityObserver = null;
  downloadFeedbackTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
  downloadFeedbackTimeouts.clear();
});

const showErrorIcon = computed(
  () =>
    props.messageStatus === 'NOT_DELIVERED' ||
    docFiles.value.some(media => media.uploadError)
);
const hasReactions = computed(() => Boolean(props.reactions?.length));

const clearDownloadFeedbackLater = (
  media: (typeof docFiles.value)[number],
  delayMs: number
) => {
  const timeoutKey = media.id || media.path || media.originName;
  const existingTimeout = downloadFeedbackTimeouts.get(timeoutKey);

  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  const timeoutId = setTimeout(() => {
    media.isDownloading = false;
    media.downloadError = false;
    downloadFeedbackTimeouts.delete(timeoutKey);
  }, delayMs);

  downloadFeedbackTimeouts.set(timeoutKey, timeoutId);
};

const handleFileClick = async (
  media: (typeof docFiles.value)[number],
  index: number
) => {
  if (media.uploadError || !media.path) {
    return;
  }

  if (isSliderContentUrl(media.originName || '')) {
    emits('set-slider', docFiles.value, index);
    return;
  }

  media.downloadError = false;
  media.isDownloading = true;

  try {
    await downloadMessageFile(media);
    clearDownloadFeedbackLater(media, 2500);
  } catch (error) {
    media.isDownloading = false;
    media.downloadError = true;

    console.error(
      '[MessageFileDownload] Failed to download file from message',
      {
        mediaId: media.id,
        mediaPath: media.path,
        fileName: media.originName,
        error
      }
    );

    showErrorNotification(downloadFailedNotificationText);
    clearDownloadFeedbackLater(media, 4000);
  }
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
