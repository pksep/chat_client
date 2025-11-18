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
        <div
          class="message-content__html"
          v-else-if="!props.loader"
          v-html="props.message"
        ></div>
      </div>
      <div class="message-time" v-if="!props.loader">
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

const { isOpen, position, openActivePopover, closeActivePopover } =
  useContextMenu();

const props = defineProps<IMessageBubbleProps>();

const messageArticle = computed(() => [
  'message__article',
  {
    'message__no-author': props.isMeSender
  }
]);

const read = false;
const blockquote = false;

const generateArray = (n: number): number[] => {
  return Array.from({ length: n });
};
</script>
