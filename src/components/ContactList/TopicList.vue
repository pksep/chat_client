<template>
  <ul
    :class="['contact-list', props.class]"
    role="list"
    :data-testid="`${props.dataTestid}-ContactList-List`"
    :aria-label="`${props.dataTestid} Contact List`"
  >
    <li
      v-for="(topic, index) in props.topics"
      :key="topic.id"
      class="contact-list__li"
      role="listitem"
      tabindex="0"
      @keydown="event => handleKeyDown(topic, event)"
      :data-testid="`${props.dataTestid}-ContactList-Item${index + 1}`"
    >
      <div
        :class="[
          'contact-list__item',
          {
            'contact-list__item--active':
              topic.id === props.selectedTopicId || isOpen[topic.id]
          }
        ]"
        role="button"
        tabindex="0"
        :aria-expanded="isOpen[topic.id] ? 'true' : 'false'"
        :aria-haspopup="true"
        @click="handleClick(topic)"
        @contextmenu="openActivePopover(topic.id, $event)"
        @keydown.enter="handleClick(topic)"
        @keydown.space="handleClick(topic)"
      >
        <Avatar
          class="contact-list__avatar"
          :initials="topic.name"
          :url="`${config.CHAT_PATH_TO_FILE_CDN}/${topic.avatarUrl}`"
          :alt="`Avatar of ${topic.name}`"
          :data-testid="`${props.dataTestid}-ContactList-Avatar${index + 1}`"
          is-icon
        />
        <div class="contact-list__block--wrapper">
          <h5
            role="heading"
            aria-level="5"
            class="contact-list__title"
            :data-testid="`${props.dataTestid}-ContactList-Title${index + 1}`"
          >
            {{ topic.name }}
          </h5>
          <div
            v-if="!!topic.lastMessage?.text"
            class="contact-list__description"
            :data-testid="`${props.dataTestid}-ContactList-Description${index + 1}`"
            :aria-label="`Latest message: ${stripHtml(topic.lastMessage?.text || 'No message')}`"
          >
            {{ stripHtml(topic.lastMessage?.text) }}
          </div>
          <div
            v-else-if="
              topic.lastMessage?.media?.length > 0 &&
              topic.lastMessage.media[0].type === MediaType.File
            "
            class="contact-list__description contact-list__description__media"
          >
            <AttachFileIcon />
            <p>Медиа</p>
          </div>
          <div
            v-else-if="topic.lastMessage?.media?.length > 0"
            class="contact-list__description contact-list__description__media"
            :data-testid="`${props.dataTestid}-ContactList-Media${index + 1}`"
          >
            <template
              v-for="media in topic.lastMessage.media.slice(0, 3)"
              :key="media.id"
              ><div>
                <img
                  v-if="media.type !== MediaType.File"
                  :src="`${config.CHAT_PATH_TO_FILE_CDN}/${media.thumbnailPath || media.path}`"
                />

                <MiniPlayIcon
                  v-if="media.type === MediaType.Video"
                  class="contact-list__description__media__play"
                />
              </div>
            </template>

            <p>{{ getTopicLastMessageLabel(topic.lastMessage?.media) }}</p>
          </div>
          <div class="contact-list__top">
            <MessageStatusIcons
              v-if="topic.lastMessage?.senderUserId === authedUser.id"
              :class="{
                'contact-list__message-status-icons': true,
                'is-read': topic.lastMessage?.status === MessageStatusEnum.READ
              }"
              :message-status="topic.lastMessage?.status"
              :is-read="topic.lastMessage?.status === MessageStatusEnum.READ"
              :is-me-sender="true"
              :data-testid="`${props.dataTestid}-ContactList-MessageStatusIcons${index + 1}`"
            />
            <span
              v-if="topic.lastMessage?.createdAt"
              class="contact-list__time"
              :data-testid="`${props.dataTestid}-ContactList-Time${index + 1}`"
              :aria-label="`Last message at ${formatTime(new Date(topic.lastMessage?.createdAt))}`"
            >
              {{ formatTime(new Date(topic.lastMessage?.createdAt)) }}
            </span>
          </div>
          <div class="contact-list__bottom">
            <div
              v-if="topic.taggedMe"
              class="contact-list__notification contact-list__mention"
              :data-testid="`${props.dataTestid}-ContactList-Mention${index + 1}`"
            >
              @
            </div>
            <div
              v-if="
                topic.unreadMessageCount > 0 &&
                topic.lastMessage?.senderUserId !== authedUser.id
              "
              :class="{
                'contact-list__notification': true,
                'contact-list__notification--muted': topic.info?.isMute
              }"
              :data-testid="`${props.dataTestid}-ContactList-Notification${index + 1}`"
              :aria-label="`${topic.unreadMessageCount} new messages`"
            >
              {{ topic.unreadMessageCount }}
            </div>
            <div
              class="contact-list__pin"
              v-if="topic.info?.isPin"
              :data-testid="`${props.dataTestid}-ContactList-Pin${index + 1}`"
              :aria-label="`Pinned contact`"
            >
              <PinIcon v-if="topic.info?.isPin" />
            </div>
          </div>
        </div>
      </div>
      <ContextMenu
        :visible="!!isOpen[topic.id]"
        :position="position"
        :data-testid="`${props.dataTestid}-ContactList-ContextMenu${index + 1}`"
        @unmount-close="() => closeActivePopover(topic.id)"
      >
        <Button
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          @click.stop="() => handlePin(topic)"
          :data-testid="`${props.dataTestid}-ContactList-PinButton${index + 1}`"
          :aria-label="
            topic.info.isPin ? `Unpin ${topic.name}` : `Pin ${topic.name}`
          "
        >
          <template v-if="!topic.info.isPin"> <PinIcon /> Закрепить </template>
          <template v-else> <UnpinIcon /> Открепить </template>
        </Button>
        <Button
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          @click="() => handleMute(topic)"
          :data-testid="`${props.dataTestid}-ContactList-NotificationButton${index + 1}`"
          :aria-label="
            topic.info.isMute
              ? `Disable notifications for ${topic.name}`
              : `Enable notifications for ${topic.name}`
          "
          :class="{ 'red-context-button': !topic.info.isMute }"
        >
          <template v-if="topic.info.isMute">
            <UnmuteIcon /> Вкл. уведомление
          </template>
          <template v-else><MuteIcon /> Выкл. уведомление </template>
        </Button>
      </ContextMenu>
    </li>
    <Loader
      v-if="props.isLoading"
      message="Загрузка контактов..."
      :dataTestid="`${props.dataTestid}-ContactList-Loading`"
    />
  </ul>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useContextMenu } from '../../composables/useContextMenu';
import { Avatar, Button, ButtonTypeEnum, SizesEnum, Loader } from '@pksep/yui';
import ContextMenu from './ContextMenu.vue';
import MessageStatusIcons from '../Messages/MessageStatusIcons.vue';
import type { IContactListProps } from './interfaces/contact-list';
import { getAuthUser } from '../../composables/useAuth';
import { IMedia, ITopic, MessageStatusEnum } from '../interfaces/interfaces';
import { useTopics } from '../../composables/useTopics';
import { formatTime } from '../../composables/useTime';
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';
import {
  navigateToDialogs,
  navigateToGroup
} from '../../composables/navigation';
import { getConfig } from '../../services/useConfig';
import { MediaType } from '@pksep/zod-shared-chat';
import AttachFileIcon from '../UI/AttachFileIcon.vue';
import MiniPlayIcon from '../UI/MiniPlayIcon.vue';
import { stripHtml } from '../../utils/stripHtml';
import PinIcon from '../UI/PinIcon.vue';
import UnpinIcon from '../UI/UnpinIcon.vue';
import UnmuteIcon from '../UI/UnmuteIcon.vue';
import MuteIcon from '../UI/MuteIcon.vue';
import { TopicType } from '../../services/useChatSDK/types';

interface IExtendedContactListProps extends IContactListProps {
  showCheckbox?: boolean;
  selectedTopicIds?: Set<string | number>;
  isLoading?: boolean;
}

const { togglePinTopic, toggleMuteTopic } = useTopics();

const props = withDefaults(defineProps<IExtendedContactListProps>(), {
  showCheckbox: false,
  selectedTopicIds: () => new Set<string | number>(),
  isLoading: false
});

const emits = defineEmits<{
  (e: 'unmount-notification', id: string): void;
  (e: 'unmount-click', id: string): void;
  (e: 'unmount-topic', contact: ITopic): void;
}>();

const { state: isMobile } = useResizeState(MAX_W_MD);

const { isOpen, position, openActivePopover, closeActivePopover } =
  useContextMenu();

const authedUser = computed(() => getAuthUser());

const config = getConfig();

const handlePin = (topic: ITopic): void => {
  togglePinTopic(topic);
  closeActivePopover(topic.id);
};

const handleMute = (topic: ITopic): void => {
  toggleMuteTopic(topic);
  closeActivePopover(topic.id);
};

const handleClick = (topic: ITopic): void => {
  if (isMobile.value) {
    if (topic.type === TopicType.DM) {
      navigateToDialogs(topic.id);
    } else if (topic.type === TopicType.Group) {
      navigateToGroup(topic.id);
    }
  }
  emits('unmount-topic', topic);
};

const handleKeyDown = (contact: ITopic, event: KeyboardEvent): void => {
  if (event.key === 'Enter' || event.key === ' ') {
    handleClick(contact);
  }
};

const getTopicLastMessageLabel = (media: IMedia[]): string => {
  let text = '';
  const haveImage = media.some(m => m.type === MediaType.Image);
  const haveVideo = media.some(m => m.type === MediaType.Video);
  if (haveImage) {
    text += 'Фото';
  }

  if (haveVideo) {
    if (text) {
      text += ', видео';
    } else {
      text = 'Видео';
    }
  }

  return text;
};
</script>
