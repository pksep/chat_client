<template>
  <div
    class="message"
    :data-testid="`${dataTestid}-MessageBubble-Container`"
    :data-role="props.author"
    :data-is-loading="!!props.loader"
    :data-is-me-sender="props.isMeSender"
  >
    <Avatar
      class="message__avatar"
      :url="props.sender"
      :alt="props.sender"
      :initials="props.sender"
      v-if="!props.isMeSender && !props.author"
      :data-testid="`${dataTestid}-MessageBubble-Avatar`"
    />
    <AiIconWrapper
      class="message__assistant"
      v-else-if="props.author === 'assistant'"
      :data-testid="`${dataTestid}-MessageBubble-AssistantIcon`"
    />
    <article
      :class="messageArticle"
      @contextmenu="evt => openActivePopover('', evt)"
      :data-testid="`${dataTestid}-MessageBubble-Article`"
    >
      <div
        class="message-content"
        :data-testid="`${dataTestid}-MessageBubble-Content`"
      >
        <blockquote
          v-if="blockquote"
          class="message-content__blockquote"
          :data-testid="`${dataTestid}-MessageBubble-Blockquote`"
        >
          <div
            class="message-content__blockquote-container"
            :data-testid="`${dataTestid}-MessageBubble-BlockquoteContainer`"
          >
            <h5 :data-testid="`${dataTestid}-MessageBubble-BlockquoteAuthor`">
              Ivan Ivanov
            </h5>
            <div :data-testid="`${dataTestid}-MessageBubble-BlockquoteText`">
              How are you?
            </div>
          </div>
        </blockquote>
        <div
          class="message-content__loading"
          v-if="props.loader"
          :data-testid="`${dataTestid}-MessageBubble-Loading`"
        >
          <template v-for="i in generateArray(3)" :key="i">
            <div
              class="message-content__loading-circle"
              :data-testid="`${dataTestid}-MessageBubble-LoadingCircle${i}`"
            ></div>
          </template>
        </div>
        <template v-else-if="!props.loader">
          <div
            v-if="!!props.message"
            class="message-content__html"
            v-html="props.message"
            :data-testid="`${dataTestid}-MessageBubble-MessageText`"
            :data-message-content="props.message"
          ></div>
          <div
            v-else-if="isImage"
            class="message-content__media"
            :data-testid="`${dataTestid}-MessageBubble-MediaContainer`"
          >
            <img
              @click="() => (fullImagePath = mediaSrc)"
              :src="mediaSrc"
              :alt="props.sender ? props.sender + ' image' : 'Shared image'"
              :data-testid="`${dataTestid}-MessageBubble-Image`"
            />
          </div>
          <div
            v-else-if="isVideo"
            class="message-content__media"
            :data-testid="`${dataTestid}-MessageBubble-MediaContainer`"
          >
            <video
              :src="mediaSrc"
              controls
              :data-testid="`${dataTestid}-MessageBubble-Video`"
              :aria-label="
                props.sender ? props.sender + ' video' : 'Shared video'
              "
            ></video>
          </div>
          <div
            v-else-if="!!props.file"
            class="message-content__file"
            :data-testid="`${dataTestid}-MessageBubble-FileContainer`"
          >
            <FileIcon
              @click="downloadFile(props.file)"
              :is-me-sender="props.isMeSender"
              :dataTestid="`${dataTestid}-MessageBubble-FileIcon`"
            />
            <div :data-testid="`${dataTestid}-MessageBubble-FileInfo`">
              <div :data-testid="`${dataTestid}-MessageBubble-FileDetails`">
                <p
                  class="message-content__file__name"
                  :data-testid="`${dataTestid}-MessageBubble-FileName`"
                >
                  {{ getShortName(file.fileName) }}
                </p>
                <p
                  class="message-content__file__size"
                  :data-testid="`${dataTestid}-MessageBubble-FileSize`"
                >
                  {{ getFormatFileSize(file.fileSize) }}
                </p>
              </div>
              <div
                class="message-time"
                :data-testid="`${dataTestid}-MessageBubble-FileTime`"
              >
                <Icon
                  v-if="read"
                  :name="IconNameEnum.read"
                  :data-testid="`${dataTestid}-MessageBubble-FileReadIcon`"
                />
                <span
                  :data-testid="`${dataTestid}-MessageBubble-FileTimeText`"
                  >{{ props.time }}</span
                >
              </div>
            </div>
          </div>
        </template>
      </div>
      <div
        class="message-time"
        v-if="!props.loader && !props.file"
        :data-testid="`${dataTestid}-MessageBubble-Time`"
      >
        <Icon
          v-if="read"
          :name="IconNameEnum.read"
          :data-testid="`${dataTestid}-MessageBubble-ReadIcon`"
        />
        <span :data-testid="`${dataTestid}-MessageBubble-TimeText`">{{
          props.time
        }}</span>
      </div>
    </article>

    <Modal
      :open="!!fullImagePath"
      class="full-image"
      position="center"
      @close="() => (fullImagePath = null)"
      :data-testid="`${dataTestid}-MessageBubble-FullImageModal`"
    >
      <img
        :src="fullImagePath"
        :data-testid="`${dataTestid}-MessageBubble-FullImageView`"
      />
    </Modal>
    <ContextMenu
      v-if="false"
      :visible="!!isOpen"
      :position="position"
      @unmount-close="closeActivePopover('')"
      :data-testid="`${dataTestid}-MessageBubble-ContextMenu`"
    >
      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.small"
        @click.stop=""
        :data-testid="`${dataTestid}-MessageBubble-ReplyButton`"
      >
        Ответить
      </Button>
    </ContextMenu>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  Avatar,
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  Modal,
  SizesEnum
} from '@pksep/yui';
import AiIconWrapper from '../UI/AiIconWrapper.vue';
import { useContextMenu } from '../../composables/useContextMenu';
import ContextMenu from '../ContactList/ContextMenu.vue';
import type { IMessageBubbleProps } from './interface/interface';
import FileIcon from '../UI/FileIcon.vue';
import { getFormatFileSize, getShortName } from '../../utils/getFormatFileSize';
import { FileElem } from '@openim/wasm-client-sdk';

const { isOpen, position, openActivePopover, closeActivePopover } =
  useContextMenu();

const props = withDefaults(defineProps<IMessageBubbleProps>(), {
  dataTestid: () => 'MessageBubble'
});

const messageArticle = computed(() => [
  'message__article',
  {
    'message__no-author': props.isMeSender,
    message__article__media: !!props.media,
    message__article__file: !!props.file
  }
]);

const read = computed(() => false);
const blockquote = computed(() => false);

const imageRegex = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
const videoRegex = /\.(mp4|webm|mov|ogg)$/i;

const isImage = computed(() => {
  if (
    props.media &&
    typeof props.media === 'object' &&
    props.media.sourcePicture.type?.startsWith('image/')
  ) {
    return true;
  }
  if (typeof props.media === 'string' && imageRegex.test(props.media)) {
    return true;
  }
  return false;
});

const isVideo = computed(() => {
  if (
    props.media &&
    typeof props.media === 'object' &&
    props.media.sourcePicture.type?.startsWith('video/')
  ) {
    return true;
  }
  if (typeof props.media === 'string' && videoRegex.test(props.media)) {
    return true;
  }
  return false;
});

const mediaSrc = computed(() => {
  if (props.media) {
    return props.media.sourcePicture?.url;
  }
  return '';
});

const fullImagePath = ref<string>(null);

const generateArray = (n: number): number[] => {
  return Array.from({ length: n });
};

const downloadFile = (file: FileElem) => {
  if (!file?.sourceUrl) return;

  const link = document.createElement('a');
  link.href = file.sourceUrl;
  link.download = file.fileName || 'file';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
</script>
