<template>
  <div
    class="message"
    :data-testid="`${dataTestid}-MessageBubble-Container`"
    :data-role="props.author"
    :data-is-loading="!!props.loader"
    :data-is-me-sender="props.isMeSender"
    @contextmenu="evt => openActivePopover(props.messageId, evt)"
  >
    <Avatar
      class="message__avatar"
      :url="props.sender"
      :alt="props.sender"
      :initials="props.sender"
      v-if="
        !props.isMeSender && !props.author && route.type !== RouteTypes.DIALOGS
      "
      :data-testid="`${dataTestid}-MessageBubble-Avatar`"
    />
    <AiIconWrapper
      class="message__assistant"
      v-else-if="props.author === 'assistant'"
      :data-testid="`${dataTestid}-MessageBubble-AssistantIcon`"
    />
    <div :class="messageArticlesStyles">
      <MessageBubbleText
        v-if="!!props.message"
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
      :open="sliderElementPaths.length > 0"
      @close="() => (sliderElementPaths = [])"
      :items="sliderElementPaths?.map(path => ({ path }))"
      :default-index="defaultIndexSlider"
    />

    <MessageContextMenu
      :is-open="isOpen"
      :position="position"
      :message-id="props.messageId"
      :topic-id="props.topicId"
      :is-me-sender="props.isMeSender"
      :message="props.message"
      :is-pin="props.isPin"
      :data-testid="dataTestid"
      @unmount-edit-message-id="emits('unmount-edit-message-id', $event)"
      @unmount-reply-message-id="emits('unmount-reply-message-id', $event)"
      @unmount-forward-message="emits('unmount-forward-message', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Avatar } from '@pksep/yui';
import AiIconWrapper from '../UI/AiIconWrapper.vue';
import {
  isOpen,
  position,
  openActivePopover
} from '../../composables/useContextMenu';
import type { IMessageBubbleProps } from './interface/interface';
import { SliderModal } from '@pksep/yui';
import { MediaType } from '@pksep/zod-shared-chat';
import { useUrlWatcher } from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import { IMedia } from '../interfaces/interfaces';
import MessageContextMenu from './MessageContextMenu.vue';
import MessageBubbleText from './MessageBubbleText.vue';
import MessageBubbleFiles from './MessageBubbleFiles.vue';
import MessageBubbleMedia from './MessageBubbleMedia.vue';
import { useMessageMedia } from './composables/useMessageMedia';

const props = withDefaults(defineProps<IMessageBubbleProps>(), {
  dataTestid: () => 'MessageBubble',
  media: () => []
});

const emits = defineEmits([
  'unmount-edit-message-id',
  'unmount-reply-message-id',
  'unmount-forward-message',
  'unmount-navigate-message-id'
]);

const messageArticlesStyles = computed(() => ({
  message__content__articles: true,
  message__content__articles__my: props.isMeSender
}));

const { getFullMediaPath, isSliderContentUrl } = useMessageMedia();

const route = useUrlWatcher();

const sliderElementPaths = ref<string[]>([]);
const defaultIndexSlider = ref<number>(0);

const docFiles = computed(
  () => props.media?.filter(media => media.type === MediaType.File) || []
);

const mediaFiles = computed(
  () => props.media?.filter(media => media.type !== MediaType.File) || []
);

const handleNavigateMessage = () => {
  emits('unmount-navigate-message-id', props.replyMessage?.id);
};

const setSliderElement = (medias: IMedia[], defaultIndex: number = 0) => {
  const selectedMedia = medias[defaultIndex];

  // Download logic
  if (
    selectedMedia.type === MediaType.File &&
    !isSliderContentUrl(selectedMedia.originName)
  ) {
    const url = getFullMediaPath(selectedMedia, false);
    const fileName = selectedMedia.originName || 'file';

    fetch(url)
      .then(res => res.blob())
      .then(blob => {
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName.includes('.') ? fileName : fileName + '.txt';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        window.URL.revokeObjectURL(blobUrl);
      })
      .catch(err => {
        console.error('Download failed', err);
      });

    return;
  }

  const sliderMedias = medias.filter(media =>
    isSliderContentUrl(getFullMediaPath(media, false))
  );

  sliderElementPaths.value = sliderMedias.map(media =>
    getFullMediaPath(media, false)
  );

  const correctedIndex = sliderMedias.findIndex(
    media => media === selectedMedia
  );

  defaultIndexSlider.value = correctedIndex !== -1 ? correctedIndex : 0;
};
</script>
