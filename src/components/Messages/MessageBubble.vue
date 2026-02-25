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
      <article
        v-if="!!props.message"
        :class="messageArticleStyles()"
        :data-testid="`${dataTestid}-MessageBubble-Article`"
      >
        <h5 v-if="props.forwardUser" class="message__article-forward-info">
          Переслано: от {{ props.forwardUser.initials }}
        </h5>
        <h3
          class="message__article-initals"
          v-if="!props.isMeSender && route.type !== RouteTypes.DIALOGS"
        >
          {{ props.sender }}
        </h3>
        <div
          class="message-content"
          :data-testid="`${dataTestid}-MessageBubble-Content`"
        >
          <blockquote
            v-if="!!props.replyMessage"
            @click="handleNavigateMessage"
            class="message-content__blockquote"
            :data-testid="`${dataTestid}-MessageBubble-Blockquote`"
          >
            <div
              class="message-content__blockquote-container"
              :data-testid="`${dataTestid}-MessageBubble-BlockquoteContainer`"
            >
              <h5 :data-testid="`${dataTestid}-MessageBubble-BlockquoteAuthor`">
                {{ props.replyMessage?.senderUser?.initials }}
              </h5>
              <p :data-testid="`${dataTestid}-MessageBubble-BlockquoteText`">
                {{ stripHtml(props.replyMessage?.text || 'Вложение') }}
              </p>
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
              @click.stop
              v-if="!!props.message"
              class="message-content__html"
              v-html="props.message"
              :data-testid="`${dataTestid}-MessageBubble-MessageText`"
            ></div>
          </template>
        </div>
        <div
          class="message-time"
          v-if="!props.loader"
          :data-testid="`${dataTestid}-MessageBubble-Time`"
        >
          <MessageEmojies :reactions="props.reactions" />
          <PinIcon
            style="width: 15px; height: 15px; margin-right: -2px"
            v-if="props.isPin"
          />
          <span
            v-if="props.isEdit"
            :data-testid="`${dataTestid}-MessageBubble-Edited`"
            >изменено</span
          >
          <span :data-testid="`${dataTestid}-MessageBubble-TimeText`">{{
            props.time
          }}</span>
          <MessageStatusIcons
            v-if="props.isMeSender"
            :is-read="props.isRead"
            :message-status="props.messageStatus"
            :data-testid="`${dataTestid}-MessageBubble`"
          />
        </div>
      </article>

      <template v-if="!props.loader && docFiles.length > 0">
        <h5 v-if="props.forwardUser" class="message__article-forward-info">
          Переслано: от {{ props.forwardUser.initials }}
        </h5>
        <article
          :class="messageArticleStyles(MediaType.File)"
          :data-testid="`${dataTestid}-MessageBubble-Article`"
        >
          <div
            v-if="
              (!props.isMeSender && route.type !== RouteTypes.DIALOGS) ||
              !!props.replyMessage
            "
            style="margin-bottom: -13px"
          >
            <h3
              style="margin-bottom: 5px"
              class="message__article-initals"
              v-if="!props.isMeSender && route.type !== RouteTypes.DIALOGS"
            >
              {{ props.sender }}
            </h3>
            <blockquote
              v-if="!!props.replyMessage"
              @click="handleNavigateMessage"
              class="message-content__blockquote"
              :data-testid="`${dataTestid}-MessageBubble-Blockquote`"
            >
              <div
                class="message-content__blockquote-container"
                :data-testid="`${dataTestid}-MessageBubble-BlockquoteContainer`"
              >
                <h5
                  :data-testid="`${dataTestid}-MessageBubble-BlockquoteAuthor`"
                >
                  {{ props.replyMessage?.senderUser?.initials }}
                </h5>
                <p :data-testid="`${dataTestid}-MessageBubble-BlockquoteText`">
                  {{ stripHtml(props.replyMessage?.text || 'Вложение') }}
                </p>
              </div>
            </blockquote>
          </div>
          <div
            v-for="(media, i) in docFiles"
            :key="media.id"
            class="message-content"
            :data-testid="`${dataTestid}-MessageBubble-Content`"
          >
            <div
              @click="setSliderElement(docFiles, i)"
              class="message-content__file"
              :data-testid="`${dataTestid}-MessageBubble-FileContainer`"
            >
              <FileIcon
                :is-me-sender="props.isMeSender"
                :dataTestid="`${dataTestid}-MessageBubble-FileIcon`"
                :is-loaded="!media.isLoading"
              />
              <div :data-testid="`${dataTestid}-MessageBubble-FileInfo`">
                <div :data-testid="`${dataTestid}-MessageBubble-FileDetails`">
                  <p
                    class="message-content__file__name"
                    :data-testid="`${dataTestid}-MessageBubble-FileName`"
                  >
                    {{ getShortName(media.originName) }}
                  </p>
                  <p
                    class="message-content__file__size"
                    :data-testid="`${dataTestid}-MessageBubble-FileSize`"
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
            :data-testid="`${dataTestid}-MessageBubble-Time`"
          >
            <MessageEmojies :reactions="props.reactions" />
            <PinIcon
              style="width: 15px; height: 15px; margin-right: -2px"
              v-if="props.isPin"
            />
            <span :data-testid="`${dataTestid}-MessageBubble-TimeText`">{{
              props.time
            }}</span>
            <MessageStatusIcons
              v-if="props.isMeSender"
              :is-read="props.isRead"
              :message-status="props.messageStatus"
              :data-testid="`${dataTestid}-MessageBubble`"
            />
          </div>
        </article>
      </template>

      <template v-if="!props.loader && mediaFiles.length > 0">
        <h5 v-if="props.forwardUser" class="message__article-forward-info">
          Переслано: от {{ props.forwardUser.initials }}
        </h5>
        <article
          :class="messageArticleStyles(MediaType.Image)"
          :data-testid="`${dataTestid}-MessageBubble-Article`"
        >
          <h3
            class="message__article-initals"
            v-if="!props.isMeSender && route.type !== RouteTypes.DIALOGS"
          >
            {{ props.sender }}
          </h3>
          <blockquote
            v-if="!!props.replyMessage"
            @click="handleNavigateMessage"
            class="message-content__blockquote"
            :data-testid="`${dataTestid}-MessageBubble-Blockquote`"
          >
            <div
              class="message-content__blockquote-container"
              :data-testid="`${dataTestid}-MessageBubble-BlockquoteContainer`"
            >
              <h5 :data-testid="`${dataTestid}-MessageBubble-BlockquoteAuthor`">
                {{ props.replyMessage?.senderUser?.initials || '' }}
              </h5>
              <p :data-testid="`${dataTestid}-MessageBubble-BlockquoteText`">
                {{ stripHtml(props.replyMessage?.text || 'Вложение') }}
              </p>
            </div>
          </blockquote>
          <div
            :class="`message-content message-content-${mediaFiles.length}-item`"
            :data-testid="`${dataTestid}-MessageBubble-Content`"
          >
            <div
              v-for="(media, i) in mediaFiles"
              :key="media.id"
              class="message-content__media"
              :data-testid="`${dataTestid}-MessageBubble-MediaContainer`"
            >
              <video
                v-if="media.type === MediaType.Video && media.localPath"
                :src="getFullMediaPath(media)"
              />

              <img
                v-else
                @click="setSliderElement(mediaFiles, i)"
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
                @click="setSliderElement(mediaFiles, i)"
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
import FileIcon from '../UI/FileIcon.vue';
import MessageStatusIcons from './MessageStatusIcons.vue';
import { getFormatFileSize, getShortName } from '../../utils/getFormatFileSize';
import { SliderModal } from '@pksep/yui';
import { MediaType, MediaTypeType } from '@pksep/zod-shared-chat';
import { getConfig } from '../../services/useConfig';
import { useUrlWatcher } from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import LoadingIcon from '../UI/LoadingIcon.vue';
import PlayIcon from '../UI/PlayIcon.vue';
import { IMedia } from '../interfaces/interfaces';
import PinIcon from '../UI/PinIcon.vue';
import { stripHtml } from '../../utils/stripHtml';
import MessageContextMenu from './MessageContextMenu.vue';
import MessageEmojies from './MessageEmojies.vue';

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

const messageArticleStyles = (type?: MediaTypeType) => [
  'message__article',
  {
    'message__no-author': props.isMeSender,
    message__article__media:
      type === MediaType.Image || type === MediaType.Video,
    message__article__file: type === MediaType.File,
    message__article__text: !type
  }
];

const messageArticlesStyles = computed(() => ({
  message__content__articles: true,
  message__content__articles__my: props.isMeSender
}));

const config = getConfig();

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

const generateArray = (n: number): number[] => {
  return Array.from({ length: n });
};

const getFullMediaPath = (media: IMedia, isThumb = true) => {
  if (media.localPath && isThumb) {
    return media.localPath;
  }

  if (media.path.endsWith('.gif')) {
    return `${config.CHAT_PATH_TO_FILE_CDN}/${media.path}`;
  }

  return `${config.CHAT_PATH_TO_FILE_CDN}/${isThumb ? media.thumbnailPath : media.path}`;
};

const isSliderContentUrl = (fileUrl: string) => {
  return fileUrl?.match(/\.(jpg|jpeg|png|webp|svg|mp4|mp3|avif|pdf)$/i);
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

const handleDragStart = (event: DragEvent, media: IMedia) => {
  const originalUrl = getFullMediaPath(media, false);

  event.dataTransfer?.setData('text/uri-list', originalUrl);
  event.dataTransfer?.setData('text/plain', originalUrl);
};
</script>
