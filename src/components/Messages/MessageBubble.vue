<template>
  <div
    class="message"
    :class="{
      'message--selection-active': props.isSelectionMode,
      'message--selected': props.isSelected,
      highlighted: props.isSelected
    }"
    :data-testid="`${dataTestid}-MessageBubble-Container`"
    :data-role="props.author"
    :data-is-loading="!!props.loader"
    :data-is-me-sender="props.isMeSender"
    @contextmenu="handleContextMenu"
    @click="handleMessageClick"
  >
    <Avatar
      class="message__avatar"
      :url="`${config.CHAT_PATH_TO_FILE_CDN}/${props.avatar}`"
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
      :open="sliderElements.length > 0"
      @close="() => (sliderElements = [])"
      :items="sliderElements"
      :default-index="defaultIndexSlider"
      @keydown.escape.stop="() => (sliderElements = [])"
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
import { computed, ref } from 'vue';
import { Avatar, Checkbox, CheckboxCircularEnum } from '@pksep/yui';
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
import { getConfig } from '../../services/useConfig';
import { isMessageSelectionModeForTopic } from '../../composables/useSelectedMessages';

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

const route = useUrlWatcher();

const config = getConfig();

const sliderElements = ref<{ path: string; name: string }[]>([]);
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

const downloadMediaFile = (media: IMedia) => {
  const url = getFullMediaPath(media, false);
  const fileName = media.originName || 'file';

  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.target = '_blank';
  link.rel = 'noopener';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const setSliderElement = async (medias: IMedia[], defaultIndex: number = 0) => {
  if (props.isSelectionMode) {
    return;
  }

  const selectedMedia = medias[defaultIndex];

  // Download logic
  if (
    selectedMedia.type === MediaType.File &&
    !isSliderContentUrl(selectedMedia.originName)
  ) {
    await downloadMediaFile(selectedMedia);
    return;
  }

  const sliderMedias = medias.filter(media =>
    isSliderContentUrl(getFullMediaPath(media, false))
  );

  sliderElements.value = sliderMedias.map(media => ({
    path: getFullMediaPath(media, false),
    name: media.originName || 'file'
  }));

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
</script>
