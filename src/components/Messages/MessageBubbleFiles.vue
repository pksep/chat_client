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
            !props.isMeSender && !isDialogRoute && !props.continuesFromPrevious
          "
          :sender="props.sender"
          :sender-user="props.senderUser"
          :sender-role="props.senderRole"
          :data-testid="`${props.dataTestid}-AuthorMeta`"
        />
        <MessageReferenceBlock
          :reply-message="props.replyMessage"
          :is-me-sender="props.isMeSender"
          :reference-width="replyReferenceWidth"
          :defer-until-measured="true"
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
            @contextmenu.prevent
            class="message-content__file"
            :data-testid="`${props.dataTestid}-FileContainer`"
          >
            <FileIcon
              :is-me-sender="props.isMeSender"
              :dataTestid="`${props.dataTestid}-FileIcon`"
              :is-loaded="!media.isLoading"
              :percent="media.uploadPercent ?? null"
            />
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
            ref="messageHtmlRef"
            class="message-content__html"
            v-html="props.message"
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
        <Transition name="reaction-row">
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
        </Transition>
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
import { useUrlWatcher } from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import { useMessageMedia } from './composables/useMessageMedia';
import { useReferenceWidth } from './composables/useReferenceWidth';
import MessageReferenceBlock from './MessageReferenceBlock.vue';
import MessageBubbleTail from './MessageBubbleTail.vue';
import { stripHtml } from '../../utils/stripHtml';
import MessageAuthorMeta from './MessageAuthorMeta.vue';
import { useMentionUserClick } from './composables/useMentionUserClick';

const props = defineProps<IMessageBubbleProps>();

const emits = defineEmits(['navigate-message', 'set-slider']);
const { primeMediaCache } = useMessageMedia();

const route = useUrlWatcher();
const isDialogRoute = computed(() => route.value.type === RouteTypes.DIALOGS);
const messageHtmlRef = ref<HTMLElement | null>(null);
const { handleMentionUserClick, syncMentionUserInteractivity } =
  useMentionUserClick();
const filesArticleRef = ref<HTMLElement | null>(null);
const replyReferenceWidth = useReferenceWidth(filesArticleRef, {
  freezeAfterFirstMeasure: true
});
const shouldPrimeFiles = ref(false);
let filesVisibilityObserver: IntersectionObserver | null = null;

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
  await nextTick();
  syncMentionUserInteractivity(messageHtmlRef.value);
};

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
});

const showErrorIcon = computed(
  () =>
    props.messageStatus === 'NOT_DELIVERED' ||
    docFiles.value.some(media => media.uploadError)
);
const hasReactions = computed(() => Boolean(props.reactions?.length));

const handleFileClick = (
  media: (typeof docFiles.value)[number],
  index: number
) => {
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
