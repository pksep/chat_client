<template>
  <div class="message">
    <Avatar
      class="message__avatar"
      :url="props.sender"
      :alt="props.sender"
      :initials="props.sender"
      v-if="!props.isMeSender && !props.author"
    />
    <AiIconWrapper
      class="message__assistant"
      v-else-if="props.author === 'assistant'"
    />
    <article
      :class="messageArticle"
      @contextmenu="evt => openActivePopover('', evt)"
    >
      <div class="message-content">
        <blockquote v-if="blockquote" class="message-content__blockquote">
          <div class="message-content__blockquote-container">
            <h5>Ivan Ivanov</h5>
            How are you?
          </div>
        </blockquote>
        <div class="message-content__loading" v-if="props.loader">
          <template v-for="i in generateArray(3)" :key="i">
            <div class="message-content__loading-circle"></div>
          </template>
        </div>
        <template v-else-if="!props.loader">
          <div
            v-if="!!props.message"
            class="message-content__html"
            v-html="props.message"
          ></div>
          <div v-if="!!props.image" class="message-content__image">
            <img :src="props.image" />
          </div>
          <div v-if="!!props.file" class="message-content__file">
            <FileIcon
              @click="downloadFile(props.file)"
              :is-me-sender="props.isMeSender"
            />
            <div>
              <div>
                <p class="message-content__file__name">{{ file.fileName }}</p>
                <p class="message-content__file__size">
                  {{ getFormatFileSize(file.fileSize) }}
                </p>
              </div>
              <div class="message-time">
                <Icon v-if="read" :name="IconNameEnum.read" />
                {{ props.time }}
              </div>
            </div>
          </div>
        </template>
      </div>
      <div class="message-time" v-if="!props.loader && !props.file">
        <Icon v-if="read" :name="IconNameEnum.read" />
        {{ props.time }}
      </div>
    </article>
    <ContextMenu
      v-if="false"
      :visible="!!isOpen"
      :position="position"
      @unmount-close="closeActivePopover('')"
    >
      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.small"
        @click.stop=""
      >
        Ответить
      </Button>
    </ContextMenu>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  Avatar,
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';
import AiIconWrapper from '../UI/AiIconWrapper.vue';
import { useContextMenu } from '../../composables/useContextMenu';
import ContextMenu from '../ContactList/ContextMenu.vue';
import type { IMessageBubbleProps } from './interface/interface';
import FileIcon from '../UI/FileIcon.vue';
import { getFormatFileSize } from '../../utils/getFormatFileSize';
import { FileElem } from '@openim/wasm-client-sdk';

const { isOpen, position, openActivePopover, closeActivePopover } =
  useContextMenu();

const props = defineProps<IMessageBubbleProps>();

const messageArticle = computed(() => [
  'message__article',
  {
    'message__no-author': props.isMeSender,
    message__article__image: !!props.image,
    message__article__file: !!props.file
  }
]);

const read = false;
const blockquote = false;

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
