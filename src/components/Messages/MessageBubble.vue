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
      :class="messageArticlesStyles"
      @contextmenu="evt => openActivePopover(props.messageId, evt)"
    >
      <article
        v-if="!!props.message"
        :class="messageArticleStyles()"
        :data-testid="`${dataTestid}-MessageBubble-Article`"
      >
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
            v-if="false"
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
            ></div>
          </template>
        </div>
        <div
          class="message-time"
          v-if="!props.loader"
          :data-testid="`${dataTestid}-MessageBubble-Time`"
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
        <article
          :class="messageArticleStyles(MediaType.File)"
          :data-testid="`${dataTestid}-MessageBubble-Article`"
        >
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
        <article
          :class="messageArticleStyles(MediaType.Image)"
          :data-testid="`${dataTestid}-MessageBubble-Article`"
        >
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
              <img
                v-if="media.type === MediaType.Image"
                @click="setSliderElement(mediaFiles, i)"
                :src="getFullMediaPath(media)"
                :alt="props.sender ? props.sender + ' image' : 'Shared image'"
              />

              <video
                v-if="media.type === MediaType.Video"
                :src="getFullMediaPath(media)"
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

    <ContextMenu
      :visible="!!isOpen[props.messageId]"
      :position="position"
      @unmount-close="closeActivePopover(props.messageId)"
      :data-testid="`${dataTestid}-MessageBubble-ContextMenu`"
    >
      <Button
        disabled
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.small"
        :data-testid="`${dataTestid}-MessageBubble-ReplyButton`"
      >
        Ответить
      </Button>
      <Button
        v-if="props.isMeSender"
        style="color: var(--error-color)"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.small"
        @click.stop="handleOpenModal"
        :data-testid="`${dataTestid}-MessageBubble-ReplyButton`"
      >
        Удалить
      </Button>
    </ContextMenu>

    <MobileModal
      v-if="isMobile"
      class="message__delete__mobile"
      headerClass="hidden"
      :show-divider="false"
      :open="deleteModalOpen"
      @unmount-close="handleCloseModal"
    >
      <h2 class="message__delete__title">Удалить сообщение</h2>
      <p class="message__delete__description">
        Вы уверены, что хотите удалить сообщение для всех участников чата?
      </p>
      <Button :type="ButtonTypeEnum.primary" @click.stop="handleCloseModal">
        Нет
      </Button>
      <Button
        :type="ButtonTypeEnum.secondary"
        @click.stop="handleDeleteMessage"
      >
        Да
      </Button>
    </MobileModal>

    <Modal
      v-else
      :open="deleteModalOpen"
      position="center"
      width="492px"
      height="178px"
      class="message__delete"
    >
      <h2 class="message__delete__title">Удалить сообщение</h2>
      <p class="message__delete__description">
        Вы уверены, что хотите удалить сообщение для всех участников чата?
      </p>
      <div class="message__delete__buttons">
        <Button
          :type="ButtonTypeEnum.secondary"
          :size="SizesEnum.small"
          @click.stop="handleCloseModal"
        >
          Нет
        </Button>
        <Button
          :type="ButtonTypeEnum.primary"
          :size="SizesEnum.small"
          @click.stop="handleDeleteMessage"
        >
          Да
        </Button>
      </div>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Avatar, Button, ButtonTypeEnum, Modal, SizesEnum } from '@pksep/yui';
import AiIconWrapper from '../UI/AiIconWrapper.vue';
import {
  isOpen,
  position,
  openActivePopover,
  closeActivePopover
} from '../../composables/useContextMenu';
import ContextMenu from '../ContactList/ContextMenu.vue';
import type { IMessageBubbleProps } from './interface/interface';
import FileIcon from '../UI/FileIcon.vue';
import MessageStatusIcons from './MessageStatusIcons.vue';
import { getFormatFileSize, getShortName } from '../../utils/getFormatFileSize';
import { SliderModal } from '@pksep/yui';
import { MediaType, MediaTypeType } from '@pksep/zod-shared-chat';
import { getConfig } from '../../services/useConfig';
import { useUrlWatcher } from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';
import { deleteMessageChat } from '../../services/useChat';
import MobileModal from '../UI/MobileModal.vue';
import LoadingIcon from '../UI/LoadingIcon.vue';
import PlayIcon from '../UI/PlayIcon.vue';
import { IMedia } from '../interfaces/interfaces';

const props = withDefaults(defineProps<IMessageBubbleProps>(), {
  dataTestid: () => 'MessageBubble',
  media: () => []
});

const messageArticleStyles = (type?: MediaTypeType) => [
  'message__article',
  {
    'message__no-author': props.isMeSender,
    message__article__media:
      type === MediaType.Image || type === MediaType.Video,
    message__article__file: type === MediaType.File
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

const deleteModalOpen = ref<boolean>(false);

const docFiles = computed(
  () => props.media?.filter(media => media.type === MediaType.File) || []
);

const mediaFiles = computed(
  () => props.media?.filter(media => media.type !== MediaType.File) || []
);

const handleOpenModal = () => {
  deleteModalOpen.value = true;
};

const handleCloseModal = () => {
  deleteModalOpen.value = false;
};

const handleDeleteMessage = async (): Promise<void> => {
  await deleteMessageChat({
    messageId: props.messageId,
    topicId: props.topicId
  });
  handleCloseModal();
};

const { state: isMobile } = useResizeState(MAX_W_MD);

const generateArray = (n: number): number[] => {
  return Array.from({ length: n });
};

const getFullMediaPath = (media: IMedia, inSlider: boolean = false) => {
  if (!media.path.includes('data:') || inSlider) {
    return `${config.CHAT_PATH_TO_FILE_CDN}/${media.publicPath || media.path}`;
  } else {
    return media.path;
  }
};

const setSliderElement = (medias: IMedia[], defaultIndex: number = 0) => {
  sliderElementPaths.value = medias.map(media => getFullMediaPath(media, true));

  defaultIndexSlider.value = defaultIndex;
};
</script>
