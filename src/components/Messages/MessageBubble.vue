<template>
  <div
    class="message"
    :class="{
      'message--selection-active': props.isSelectionMode,
      'message--selected': props.isSelected,
      'message--continued': props.continuesWithNext,
      'message--continued-from-previous': props.continuesFromPrevious,
      highlighted: props.isSelected
    }"
    :data-testid="`${dataTestid}-MessageBubble-Container`"
    :data-role="props.author"
    :data-is-loading="!!props.loader"
    :data-is-me-sender="props.isMeSender"
    @contextmenu="handleContextMenu"
    @click="handleMessageClick"
    @dblclick="handleDoubleTap"
  >
    <div
      :class="{
        'message-selection-toggle': true,
        'message-selection-toggle__hide': !props.isSelectionMode
      }"
    >
      <Checkbox
        :data-testid="props.selectionTestId"
        :model-value="!!props.isSelected"
        :circular="CheckboxCircularEnum.circled"
        @update:model-value="handleToggleSelection"
        @click.stop
      />
    </div>
    <div :class="messageArticlesStyles">
      <MessageBubbleText
        v-if="shouldRenderStandaloneText"
        v-bind="props"
        @navigate-message="handleNavigateMessage"
      />

      <MessageBubbleFiles
        v-if="!props.loader && docFiles.length > 0"
        v-bind="props"
        @navigate-message="handleNavigateMessage"
        @set-slider="setSliderElement"
      />

      <MessageBubbleMedia
        v-if="!props.loader && mediaFiles.length > 0"
        v-bind="props"
        @navigate-message="handleNavigateMessage"
        @set-slider="setSliderElement"
      />
    </div>
    <SliderModal
      @touchstart.stop
      @touchend.stop
      :open="sliderElements.length > 0"
      @close="closeSlider"
      :items="sliderElements"
      :default-index="defaultIndexSlider"
      @keydown.escape.stop="closeSlider"
    />

    <MessageContextMenu
      v-if="isOpen"
      :is-open="isOpen"
      :position="position"
      :message-id="props.messageId"
      :topic-id="props.topicId"
      :is-selection-mode="props.isSelectionMode"
      :is-selected="props.isSelected"
      :is-me-sender="props.isMeSender"
      :message="props.message"
      :is-pin="props.isPin"
      :data-testid="dataTestid"
      @unmount-edit-message-id="emits('unmount-edit-message-id', $event)"
      @unmount-reply-message-id="emits('unmount-reply-message-id', $event)"
      @unmount-forward-message="emits('unmount-forward-message', $event)"
      @unmount-retry-message-id="emits('unmount-retry-message-id', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Capacitor } from '@capacitor/core';
import { Checkbox, CheckboxCircularEnum } from '@pksep/yui';
import {
  isOpen,
  position,
  openActivePopover
} from '../../composables/useContextMenu';
import type { IMessageBubbleProps } from './interface/interface';
import { SliderModal } from '@pksep/yui';
import { MediaType } from '@pksep/zod-shared-chat';
import { IMedia } from '../interfaces/interfaces';
import MessageContextMenu from './MessageContextMenu.vue';
import MessageBubbleText from './MessageBubbleText.vue';
import MessageBubbleFiles from './MessageBubbleFiles.vue';
import MessageBubbleMedia from './MessageBubbleMedia.vue';
import { useMessageMedia } from './composables/useMessageMedia';
import { isMessageSelectionModeForTopic } from '../../composables/useSelectedMessages';
import { ensureMediaObjectUrl } from '../../services/useMediaBlobCache';
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
import { useBackButton } from '../../composables/useBackButton';
import { setReactionMessage } from '../../services/useChat';
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';

const props = withDefaults(defineProps<IMessageBubbleProps>(), {
  dataTestid: () => 'MessageBubble',
  media: () => []
});

const emits = defineEmits([
  'unmount-edit-message-id',
  'unmount-reply-message-id',
  'unmount-forward-message',
  'unmount-retry-message-id',
  'unmount-navigate-message-id',
  'toggle-selection'
]);

const messageArticlesStyles = computed(() => ({
  message__content__articles: true,
  message__content__articles__my: props.isMeSender
}));

const { getFullMediaPath, isSliderContentUrl } = useMessageMedia();
const { state: isMobile } = useResizeState(MAX_W_MD);

const sliderElements = ref<{ path: string; name: string; file?: File }[]>([]);
const defaultIndexSlider = ref<number>(0);
const { addHandler: addBackHandler, removeHandler: removeBackHandler } =
  useBackButton();

const closeSlider = (): void => {
  sliderElements.value = [];
};

watch(
  () => sliderElements.value.length > 0,
  isOpen => {
    if (isOpen) {
      addBackHandler(closeSlider);
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

const mediaFiles = computed(
  () => props.media?.filter(media => media.type !== MediaType.File) || []
);

const hasTextContent = computed(() =>
  Boolean(stripHtml(props.message || '').trim())
);

const shouldRenderStandaloneText = computed(
  () =>
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

const buildSliderItem = async (media: IMedia) => {
  const fallbackPath = getFullMediaPath(media, false);

  if (!isNativePdfMedia(media) || !media.path) {
    return {
      path: fallbackPath,
      name: media.originName || 'file'
    };
  }

  const cachedObjectUrl = await ensureMediaObjectUrl(media.path);

  if (!cachedObjectUrl) {
    return {
      path: fallbackPath,
      name: media.originName || 'file'
    };
  }

  try {
    const blob = await fetch(cachedObjectUrl).then(response => response.blob());
    const file = new File([blob], media.originName || 'file.pdf', {
      type: blob.type || 'application/pdf'
    });

    return {
      path: cachedObjectUrl,
      name: media.originName || 'file',
      file
    };
  } catch {
    return {
      path: cachedObjectUrl,
      name: media.originName || 'file'
    };
  }
};

const downloadMediaFile = async (media: IMedia) => {
  if (await downloadNativeFile(media)) {
    return;
  }

  const fallbackUrl = getFullMediaPath(media, false);
  const fileName = media.originName || 'file';
  const cachedObjectUrl = await ensureMediaObjectUrl(media.path);

  const link = document.createElement('a');

  link.href = cachedObjectUrl || fallbackUrl;
  link.download = fileName;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const setSliderElement = async (medias: IMedia[], defaultIndex: number = 0) => {
  if (props.isSelectionMode) {
    return;
  }

  const selectedMedia = medias[defaultIndex];

  if (!selectedMedia) {
    return;
  }

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
};

const handleContextMenu = (event: MouseEvent) => {
  if (isMessageSelectionModeForTopic(props.topicId) && !props.isSelected) {
    event.preventDefault();
    return;
  }

  openActivePopover(props.messageId, event);
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

const handleDoubleTap = (event: MouseEvent): void => {
  if (
    !isMobile.value ||
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
    target.closest('button, a, input, .reactions, .message-selection-toggle')
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
