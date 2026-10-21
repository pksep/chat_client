<template>
  <div
    class="message"
    :class="{
      'message--selection-active': props.isSelectionMode,
      'message--selected': props.isSelected,
      'message--continued': props.continuesWithNext,
      'message--continued-from-previous': props.continuesFromPrevious,
      'message--call-topic-default': isCallTopicDefaultMessageEx,
      highlighted: props.isSelected
    }"
    :data-testid="`${dataTestid}-MessageBubble-Container`"
    :data-role="props.author"
    :data-is-loading="!!props.loader"
    :data-is-me-sender="props.isMeSender"
    :data-message-id="props.messageId"
    @contextmenu="handleContextMenu"
    @pointerdown="startLongPress"
    @click="handleMessageClick"
    @dblclick="handleDoubleClick"
  >
    <div
      :class="{
        'message-selection-toggle': true,
        'message-selection-toggle__hide': !props.isSelectionMode
      }"
    >
      <Checkbox
        v-if="props.isSelectionMode"
        :data-testid="props.selectionTestId"
        :model-value="!!props.isSelected"
        :circular="CheckboxCircularEnum.circled"
        @update:model-value="handleToggleSelection"
        @click.stop
      />
    </div>
    <div :class="messageArticlesStyles">
      <MessageQuickReply
        v-if="canQuickReply && mediaFiles.length > 0 && docFiles.length === 0"
        :data-testid="dataTestid"
        @reply="emits('unmount-reply-message-id', props.messageId)"
      />
      <MessageBubbleText
        v-if="shouldRenderStandaloneText"
        v-bind="props"
        :is-read="hasExternalChannel ? false : props.isRead"
        :message-status="hasExternalChannel ? undefined : props.messageStatus"
        @navigate-message="handleNavigateMessage"
      >
        <template #quick-reply>
          <MessageQuickReply
            v-if="canQuickReply"
            :data-testid="dataTestid"
            @reply="emits('unmount-reply-message-id', props.messageId)"
          />
        </template>
      </MessageBubbleText>

      <MessageBubbleSticker
        v-if="sticker && !props.loader"
        v-bind="props"
        :sticker="sticker"
        @navigate-message="handleNavigateMessage"
        @activate="handleStickerClick"
      >
        <template #quick-reply>
          <MessageQuickReply
            v-if="canQuickReply"
            :data-testid="dataTestid"
            @reply="emits('unmount-reply-message-id', props.messageId)"
          />
        </template>
      </MessageBubbleSticker>

      <MessageBubbleFiles
        v-if="!props.loader && docFiles.length > 0"
        v-bind="props"
        :is-read="hasExternalChannel ? false : props.isRead"
        :message-status="hasExternalChannel ? undefined : props.messageStatus"
        @navigate-message="handleNavigateMessage"
        @set-slider="setSliderElement"
      >
        <template #quick-reply>
          <MessageQuickReply
            v-if="canQuickReply"
            :data-testid="dataTestid"
            @reply="emits('unmount-reply-message-id', props.messageId)"
          />
        </template>
      </MessageBubbleFiles>

      <MessageBubbleMedia
        v-if="!props.loader && mediaFiles.length > 0"
        v-bind="props"
        :is-read="hasExternalChannel ? false : props.isRead"
        :message-status="hasExternalChannel ? undefined : props.messageStatus"
        @navigate-message="handleNavigateMessage"
        @set-slider="setSliderElement"
      />
    </div>
    <SliderModal
      v-if="sliderElements.length > 0"
      @touchstart.stop
      @touchend.stop
      :open="isSliderOpen"
      @close="closeSlider"
      :items="sliderElements"
      :default-index="defaultIndexSlider"
      @keydown.escape.stop="closeSlider"
    />

    <Teleport v-if="isContextMenuOpen" to="body">
      <MessageContextMenu
        :is-open="isOpen"
        :position="position"
        :message-id="props.messageId"
        :topic-id="props.topicId"
        :is-selection-mode="props.isSelectionMode"
        :is-selected="props.isSelected"
        :is-me-sender="props.isMeSender"
        :message="props.message"
        :message-ex="props.messageEx"
        :media="props.media"
        :context-media-id="contextMediaId"
        :is-pin="props.isPin"
        :data-testid="dataTestid"
        @unmount-edit-message-id="emits('unmount-edit-message-id', $event)"
        @unmount-reply-message-id="emits('unmount-reply-message-id', $event)"
        @unmount-forward-message="emits('unmount-forward-message', $event)"
        @unmount-retry-message-id="emits('unmount-retry-message-id', $event)"
        @unmount-download-message-media="handleDownloadMessageMedia"
      />
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { isIosWeb } from '../../utils/ios-pwa-viewport';
import { Capacitor } from '@capacitor/core';
import { Checkbox, CheckboxCircularEnum } from '@pksep/yui';
import {
  isOpen,
  position,
  contextMediaId,
  startTouchLongPress,
  openActivePopover
} from '../../composables/useContextMenu';
import type { IMessageBubbleProps } from './interface/interface';
import { SliderModal } from '@pksep/yui';
import { createLiveSliderItem } from '../../utils/live-slider-item';
import { MediaType } from '@pksep/zod-shared-chat';
import { IMedia } from '../interfaces/interfaces';
import MessageContextMenu from './MessageContextMenu.vue';
import MessageBubbleText from './MessageBubbleText.vue';
import MessageQuickReply from './MessageQuickReply.vue';
import MessageBubbleSticker from './MessageBubbleSticker.vue';
import { getMessageSticker } from '../../utils/stickers';
import { hasExternalMessageChannel } from '../../utils/managerMessageChannel';
import MessageBubbleFiles from './MessageBubbleFiles.vue';
import MessageBubbleMedia from './MessageBubbleMedia.vue';
import { useMessageMedia } from './composables/useMessageMedia';
import { isMessageSelectionModeForTopic } from '../../composables/useSelectedMessages';
import {
  downloadNativeFile,
  handleNativeFileClick,
  isNativePdfMedia,
  openNativeFile
} from '../../services/useNativeFile';
import { stripHtml } from '../../utils/stripHtml';
import {
  getMessageReplyQuoteOccurrenceIndex,
  getMessageReplyQuoteText
} from '../../utils/messageReplyQuote';
import {
  BackButtonPriority,
  useBackButton
} from '../../composables/useBackButton';
import { setReactionMessage } from '../../services/useChat';
import { parseCallTopicDefaultMessageEx } from '../../utils/call-topic';
import {
  buildMediaDownloadUrl,
  triggerBrowserDownload,
  triggerBrowserDownloads
} from '../../utils/media-download';
import { VIDEO_FALLBACK_THUMBNAIL } from '../../utils/mediaPreview';
import {
  ensureMediaObjectUrl,
  isInquiryFile
} from '../../services/useMediaBlobCache';
import { showErrorNotification } from '../../composables/useNotifications';
import { MessageStatus, TopicType } from '../../services/useChatSDK/types';
import { getSelectedTopic } from '../../composables/useTopics';

const props = withDefaults(defineProps<IMessageBubbleProps>(), {
  dataTestid: () => 'MessageBubble',
  media: () => []
});

// Прочтение другим менеджером не подтверждает прочтение клиентом площадки.
const hasExternalChannel = computed(() => {
  return hasExternalMessageChannel(props.messageEx);
});

const emits = defineEmits([
  'unmount-edit-message-id',
  'unmount-reply-message-id',
  'unmount-forward-message',
  'unmount-retry-message-id',
  'unmount-navigate-message-id',
  'open-sticker-pack',
  'toggle-selection'
]);

const messageArticlesStyles = computed(() => ({
  message__content__articles: true,
  message__content__articles__my: props.isMeSender
}));

const {
  getFullMediaPath,
  getRemoteThumbnailUrl,
  getSliderMediaPath,
  isSliderContentUrl
} = useMessageMedia();
const isContextMenuOpen = computed(
  () => !!props.messageId && isOpen.value[props.messageId] === true
);
const isCallTopicDefaultMessageEx = computed(() =>
  Boolean(parseCallTopicDefaultMessageEx(props.messageEx))
);
const canReplyToMessage = computed(
  () =>
    !props.isSelectionMode &&
    !props.loader &&
    !!props.messageId &&
    !!props.topicId &&
    !isCallTopicDefaultMessageEx.value &&
    props.messageStatus !== MessageStatus.NotDelivered &&
    props.messageStatus !== MessageStatus.Wait &&
    !props.media.some(media => media.uploadError)
);
const canQuickReply = computed(
  () =>
    !props.isMobile &&
    !props.isMeSender &&
    getSelectedTopic(props.topicId)?.type === TopicType.Group &&
    canReplyToMessage.value
);

const sliderElements = ref<
  {
    path: string;
    fallbackPath?: string;
    name: string;
    file?: File;
    downloadPath?: string;
  }[]
>([]);
const defaultIndexSlider = ref<number>(0);
const isSliderOpen = ref(false);
const { addHandler: addBackHandler, removeHandler: removeBackHandler } =
  useBackButton();

const closeSlider = (): void => {
  isSliderOpen.value = false;
  sliderElements.value = [];
};

watch(
  () => sliderElements.value.length > 0,
  isOpen => {
    if (isOpen) {
      addBackHandler(closeSlider, BackButtonPriority.overlay);
      return;
    }

    removeBackHandler(closeSlider);
  }
);

onBeforeUnmount(() => {
  removeBackHandler(closeSlider);
});

const docFiles = computed(
  () => props.media?.filter(media => media.type === MediaType.File) || []
);

const mediaFiles = computed(() =>
  sticker.value
    ? []
    : props.media?.filter(media => media.type !== MediaType.File) || []
);

const hasTextContent = computed(() =>
  Boolean(stripHtml(props.message || '').trim())
);

const sticker = computed(() => getMessageSticker(props.messageEx, props.media));

const shouldRenderStandaloneText = computed(
  () =>
    !sticker.value &&
    hasTextContent.value &&
    mediaFiles.value.length === 0 &&
    docFiles.value.length === 0
);
const isAndroidNativePlatform = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

const handleNavigateMessage = () => {
  emits('unmount-navigate-message-id', {
    message: props.replyMessage,
    quoteText: getMessageReplyQuoteText(props.messageEx),
    quoteOccurrenceIndex: getMessageReplyQuoteOccurrenceIndex(props.messageEx)
  });
};

const getSliderDetectionValue = (media: IMedia) =>
  media.originName || media.path || '';

const isSliderContentMedia = (media: IMedia) =>
  media.type === MediaType.Image ||
  media.type === MediaType.Video ||
  isSliderContentUrl(getSliderDetectionValue(media), {
    includePdf: !isAndroidNativePlatform()
  });

const buildSliderItem = (
  initialMedia: IMedia
): ReturnType<typeof createLiveSliderItem> =>
  createLiveSliderItem(() => {
    const media =
      props.media?.find(item => item.id === initialMedia.id) || initialMedia;
    const originalPath = getFullMediaPath(media, false);
    const sliderPath = getSliderMediaPath(media);
    const fallbackPath =
      getRemoteThumbnailUrl(media) ||
      (media.type === MediaType.Video
        ? media.localThumbnailPath || VIDEO_FALLBACK_THUMBNAIL
        : undefined);
    const name = media.originName || 'file';
    const downloadPath = buildMediaDownloadUrl(originalPath, name);

    return {
      path: sliderPath,
      mediaType:
        media.type === MediaType.Image
          ? 'image'
          : media.type === MediaType.Video
            ? 'video'
            : undefined,
      fallbackPath,
      name,
      downloadPath
    };
  });

const downloadMediaFile = async (media: IMedia) => {
  if (await downloadNativeFile(media)) {
    return;
  }

  const fallbackUrl = getFullMediaPath(media, false);
  const fileName = media.originName || 'file';
  triggerBrowserDownload(fallbackUrl, fileName);
};

const prepareInquiryMedias = async (medias: IMedia[]): Promise<boolean> => {
  const paths = [
    ...new Set(medias.map(media => media.path).filter(isInquiryFile))
  ];
  const results = await Promise.all(
    paths.map(path => ensureMediaObjectUrl(path))
  );

  if (results.some(url => !url)) {
    showErrorNotification('Не удалось загрузить вложение. Повторите попытку.');
    return false;
  }

  return true;
};

const handleDownloadMessageMedia = async (): Promise<void> => {
  const mediaFiles = props.media || [];

  if (!(await prepareInquiryMedias(mediaFiles))) return;

  if (!isAndroidNativePlatform()) {
    await triggerBrowserDownloads(
      mediaFiles.map(media => ({
        url: getFullMediaPath(media, false),
        fileName: media.originName || 'file'
      }))
    );
    return;
  }

  for (const media of mediaFiles) {
    await downloadMediaFile(media);
  }
};

const setSliderElement = async (
  medias: IMedia[],
  defaultIndex: number = 0
): Promise<void> => {
  if (props.isSelectionMode) {
    return;
  }

  const selectedMedia = medias[defaultIndex];

  if (!selectedMedia) {
    return;
  }

  const openingMedias = isSliderContentMedia(selectedMedia)
    ? medias.filter(isSliderContentMedia)
    : [selectedMedia];

  if (!(await prepareInquiryMedias(openingMedias))) return;

  if (
    selectedMedia.type === MediaType.File &&
    !isSliderContentMedia(selectedMedia) &&
    isAndroidNativePlatform()
  ) {
    if (await handleNativeFileClick(selectedMedia)) {
      return;
    }
  }

  if (
    selectedMedia.type === MediaType.File &&
    !isSliderContentMedia(selectedMedia) &&
    isNativePdfMedia(selectedMedia) &&
    isAndroidNativePlatform()
  ) {
    try {
      if (await openNativeFile(selectedMedia)) {
        return;
      }
    } catch {
      // Fall back to download in Android APK when native PDF opening fails.
    }

    await downloadMediaFile(selectedMedia);
    return;
  }

  if (
    selectedMedia.type === MediaType.File &&
    !isSliderContentMedia(selectedMedia) &&
    isNativePdfMedia(selectedMedia)
  ) {
    if (await openNativeFile(selectedMedia)) {
      return;
    }
  }

  // Download logic
  if (
    selectedMedia.type === MediaType.File &&
    !isSliderContentMedia(selectedMedia)
  ) {
    await downloadMediaFile(selectedMedia);
    return;
  }

  const sliderMedias = medias.filter(isSliderContentMedia);

  sliderElements.value = await Promise.all(
    sliderMedias.map(media => buildSliderItem(media))
  );

  const correctedIndex = sliderMedias.findIndex(
    media => media === selectedMedia
  );

  defaultIndexSlider.value = correctedIndex !== -1 ? correctedIndex : 0;

  await nextTick();
  isSliderOpen.value = true;
};

const handleContextMenu = (event: MouseEvent) => {
  if (isMessageSelectionModeForTopic(props.topicId) && !props.isSelected) {
    event.preventDefault();
    return;
  }

  openActivePopover(props.messageId, event);
};

const startLongPress = (event: PointerEvent) => {
  if (
    !isIosWeb() ||
    !props.messageId ||
    event.pointerType !== 'touch' ||
    !event.isPrimary ||
    props.isSelectionMode ||
    props.loader ||
    !(event.target instanceof Element) ||
    !(event.currentTarget instanceof HTMLElement) ||
    event.target.closest(
      'button, a, input, textarea, [contenteditable="true"], .reactions'
    )
  )
    return;
  startTouchLongPress(props.messageId, event);
};

const handleToggleSelection = () => {
  if (!props.isSelectionMode) {
    return;
  }

  emits('toggle-selection');
};

const handleMessageClick = () => {
  if (!props.isSelectionMode) {
    return;
  }

  emits('toggle-selection');
};

const handleStickerClick = () => {
  if (props.isSelectionMode) handleMessageClick();
  else if (sticker.value?.pack) emits('open-sticker-pack', sticker.value.pack);
};

const handleDoubleClick = (event: MouseEvent): void => {
  if (props.isMobile) {
    handleDoubleTap(event);
    return;
  }
  const target = event.target;
  if (
    !canReplyToMessage.value ||
    isSliderOpen.value ||
    !(target instanceof Element) ||
    target.closest(
      'button, a, input, textarea, select, [role="button"], [contenteditable="true"], img, video, audio, canvas, .message-content__html, .message-content--media, .message-content__file, .message__article__file, .message-sticker__image, .message-emoji__symbol, .message__author-meta, .message-reference-block, .message-reference-forward, .message-time, .reactions, .message-selection-toggle'
    )
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  emits('unmount-reply-message-id', props.messageId);
};

const handleDoubleTap = (event: MouseEvent): void => {
  if (
    !props.isMobile ||
    props.isSelectionMode ||
    props.loader ||
    !props.messageId ||
    !props.topicId
  ) {
    return;
  }

  const target = event.target;

  if (
    target instanceof Element &&
    target.closest(
      'button, a, input, .reactions, .message-selection-toggle, .message__article__file'
    )
  ) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const hasOwnHeartReaction = props.reactions?.some(
    reaction =>
      reaction.senderUserId === props.authUserId && reaction.text === '❤️'
  );

  if (hasOwnHeartReaction) {
    return;
  }

  void setReactionMessage({
    messageId: props.messageId,
    topicId: props.topicId,
    emoji: '❤️'
  });
};
</script>
