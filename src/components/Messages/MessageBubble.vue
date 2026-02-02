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
      @click="evt => isMobile && openActivePopover(props.messageId, evt)"
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
            :is-read="props.isRead"
            :message-status="props.messageStatus"
            :data-testid="`${dataTestid}-MessageBubble`"
          />
        </div>
      </article>

      <template v-if="!props.loader">
        <article
          v-for="media in props.media || []"
          :key="media.id"
          :class="messageArticleStyles(media.type)"
          :data-testid="`${dataTestid}-MessageBubble-Article`"
        >
          <div
            class="message-content"
            :data-testid="`${dataTestid}-MessageBubble-Content`"
          >
            <div
              v-if="media.type === MediaType.Image"
              class="message-content__media"
              :data-testid="`${dataTestid}-MessageBubble-MediaContainer`"
            >
              <img
                @click="
                  () =>
                    (fullImagePath = `${config.CHAT_PATH_TO_FILE_CDN}/${media.path}`)
                "
                :src="`${config.CHAT_PATH_TO_FILE_CDN}/${media.path}`"
                :alt="props.sender ? props.sender + ' image' : 'Shared image'"
                :data-testid="`${dataTestid}-MessageBubble-Image`"
              />
            </div>
            <div
              v-if="media.type === MediaType.Video"
              class="message-content__media"
              :data-testid="`${dataTestid}-MessageBubble-MediaContainer`"
            >
              <video
                @click="
                  () =>
                    (fullImagePath = `${config.CHAT_PATH_TO_FILE_CDN}/${media.path}`)
                "
                :src="`${config.CHAT_PATH_TO_FILE_CDN}/${media.path}`"
                controls
                :data-testid="`${dataTestid}-MessageBubble-Video`"
                :aria-label="
                  props.sender ? `${props.sender} video` : 'Shared video'
                "
              ></video>
            </div>

            <div
              v-if="media.type === MediaType.File"
              @click="
                () =>
                  (fullImagePath = `${config.CHAT_PATH_TO_FILE_CDN}/${media.path}`)
              "
              class="message-content__file"
              :data-testid="`${dataTestid}-MessageBubble-FileContainer`"
            >
              <FileIcon
                :is-me-sender="props.isMeSender"
                :dataTestid="`${dataTestid}-MessageBubble-FileIcon`"
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
    </div>
    <SliderModal
      :open="!!fullImagePath"
      @close="() => (fullImagePath = null)"
      :items="[{ path: fullImagePath }]"
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
      :open="modalOpen"
      @unmount-close="handleCloseModal"
    >
      <h2 class="message__delete__title">Удалить сообщение</h2>
      <p class="message__delete__description">
        Вы уверены, что хотите удалить сообщение для всех участников чата?
      </p>
      <Button
        :type="ButtonTypeEnum.secondary"
        @click.stop="handleCloseModal"
      >
        Нет
      </Button>
      <Button :type="ButtonTypeEnum.primary" @click.stop="handleDeleteMessage">
        Да
      </Button>
    </MobileModal>

    <Modal
      v-else
      :open="modalOpen"
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

const fullImagePath = ref<string | null>(null);

const modalOpen = ref<boolean>(false);

const handleOpenModal = () => {
  modalOpen.value = true;
};

const handleCloseModal = () => {
  modalOpen.value = false;
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
</script>
