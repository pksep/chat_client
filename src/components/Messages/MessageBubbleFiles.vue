<template>
  <template v-if="docFiles.length > 0">
    <h5 v-if="props.forwardUser" class="message__article-forward-info">
      Переслано: от {{ props.forwardUser.initials }}
    </h5>
    <article
      :class="messageArticleStyles"
      :data-testid="`${props.dataTestid}-Article`"
    >
      <div
        v-if="(!props.isMeSender && !isDialogRoute) || !!props.replyMessage"
        style="margin-bottom: -13px"
      >
        <h3
          style="margin-bottom: 5px"
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
              {{ props.replyMessage?.senderUser?.initials }}
            </h5>
            <p :data-testid="`${props.dataTestid}-BlockquoteText`">
              {{ stripHtml(props.replyMessage?.text || 'Вложение') }}
            </p>
          </div>
        </blockquote>
      </div>
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
        class="message-time"
        v-if="!props.loader && !props.file"
        :data-testid="`${props.dataTestid}-Time`"
      >
        <MessageEmojies :reactions="props.reactions" />
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
    </article>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { IMessageBubbleProps } from './interface/interface';
import { MediaType } from '@pksep/zod-shared-chat';
import MessageStatusIcons from './MessageStatusIcons.vue';
import FileIcon from '../UI/FileIcon.vue';
import PinIcon from '../UI/PinIcon.vue';
import MessageEmojies from './MessageEmojies.vue';
import ErrorIcon from '../UI/ErrorIcon.vue';
import { stripHtml } from '../../utils/stripHtml';
import { getFormatFileSize, getShortName } from '../../utils/getFormatFileSize';
import { useUrlWatcher } from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';

const props = defineProps<IMessageBubbleProps>();

const emits = defineEmits(['navigate-message', 'set-slider']);

const route = useUrlWatcher();
const isDialogRoute = computed(() => route.value.type === RouteTypes.DIALOGS);

const docFiles = computed(
  () => props.media?.filter(media => media.type === MediaType.File) || []
);

const showErrorIcon = computed(
  () =>
    props.messageStatus === 'NOT_DELIVERED' ||
    docFiles.value.some(media => media.uploadError)
);

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
    message__article__file: true
  }
]);
</script>
