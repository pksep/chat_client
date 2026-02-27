<template>
  <template v-if="mediaFiles.length > 0">
    <h5 v-if="props.forwardUser" class="message__article-forward-info">
      Переслано: от {{ props.forwardUser.initials }}
    </h5>
    <article
      :class="messageArticleStyles"
      :data-testid="`${props.dataTestid}-Article`"
    >
      <h3
        class="message__article-initals"
        v-if="!props.isMeSender && !isDialogRoute"
      >
        {{ props.sender }}
      </h3>
      <blockquote
        v-if="!!props.replyMessage"
        @click="$emit('navigate-message')"
        class="message-content__blockquote"
        :data-testid="`${props.dataTestid}-Blockquote`"
      >
        <div
          class="message-content__blockquote-container"
          :data-testid="`${props.dataTestid}-BlockquoteContainer`"
        >
          <h5 :data-testid="`${props.dataTestid}-BlockquoteAuthor`">
            {{ props.replyMessage?.senderUser?.initials || '' }}
          </h5>
          <p :data-testid="`${props.dataTestid}-BlockquoteText`">
            {{ stripHtml(props.replyMessage?.text || 'Вложение') }}
          </p>
        </div>
      </blockquote>
      <div
        :class="`message-content message-content-${mediaFiles.length}-item`"
        :data-testid="`${props.dataTestid}-Content`"
      >
        <div
          v-for="(media, i) in mediaFiles"
          :key="media.id"
          class="message-content__media"
          :data-testid="`${props.dataTestid}-MediaContainer`"
        >
          <video
            v-if="media.type === MediaType.Video && media.localPath"
            :src="getFullMediaPath(media)"
          />

          <img
            v-else
            @click="$emit('set-slider', mediaFiles, i)"
            :src="getFullMediaPath(media)"
            :alt="props.sender ? props.sender + ' image' : 'Shared image'"
            @dragstart="handleDragStart($event, media)"
          />

          <div
            v-if="typeof media.isLoading === 'boolean'"
            class="message-content__media-loading"
          >
            <LoadingIcon :is-loaded="!media.isLoading" />
          </div>

          <div
            v-else-if="media.type === MediaType.Video"
            @click="$emit('set-slider', mediaFiles, i)"
            class="message-content__media-video"
          >
            <PlayIcon />
          </div>
        </div>
      </div>

      <div class="message-time" v-if="!props.file">
        <MessageEmojies :reactions="props.reactions" />
        <PinIcon
          style="width: 15px; height: 15px; margin-right: -2px"
          v-if="props.isPin"
        />
        <span>{{ props.time }}</span>
        <MessageStatusIcons
          v-if="props.isMeSender"
          :is-read="props.isRead"
          :message-status="props.messageStatus"
        />
      </div>
    </article>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { IMessageBubbleProps } from './interface/interface';
import { MediaType } from '@pksep/zod-shared-chat';
import MessageStatusIcons from './MessageStatusIcons.vue';
import LoadingIcon from '../UI/LoadingIcon.vue';
import PlayIcon from '../UI/PlayIcon.vue';
import PinIcon from '../UI/PinIcon.vue';
import MessageEmojies from './MessageEmojies.vue';
import { stripHtml } from '../../utils/stripHtml';
import { useUrlWatcher } from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import { useMessageMedia } from './composables/useMessageMedia';

const props = defineProps<IMessageBubbleProps>();

defineEmits(['navigate-message', 'set-slider']);

const { getFullMediaPath, handleDragStart } = useMessageMedia();

const route = useUrlWatcher();
const isDialogRoute = computed(() => route.value.type === RouteTypes.DIALOGS);

const mediaFiles = computed(
  () => props.media?.filter(media => media.type !== MediaType.File) || []
);

const messageArticleStyles = computed(() => [
  'message__article',
  {
    'message__no-author': props.isMeSender,
    message__article__media: true
  }
]);
</script>
