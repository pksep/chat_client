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
        @click.stop="handleClick(topic)"
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
            class="contact-list__description"
            :data-testid="`${props.dataTestid}-ContactList-Description${index + 1}`"
            :aria-label="`Latest message: ${topic.lastMessage || 'No message'}`"
            v-html="topic.lastMessage?.text || '--'"
          ></div>
          <div class="contact-list__top">
            <MessageStatusIcons
              v-if="topic.lastMessage?.senderUserId === authedUser.id"
              class="contact-list__message-status-icons"
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
              v-if="
                topic.unreadMessageCount > 0 &&
                topic.lastMessage?.senderUserId !== authedUser.id
              "
              :class="{
                'contact-list__notification': true,
                'contact-list__notification--muted': topic.info.isMute
              }"
              :data-testid="`${props.dataTestid}-ContactList-Notification${index + 1}`"
              :aria-label="`${topic.unreadMessageCount} new messages`"
            >
              {{ topic.unreadMessageCount }}
            </div>
            <div
              v-if="topic.info?.isPin"
              :data-testid="`${props.dataTestid}-ContactList-Pin${index + 1}`"
              :aria-label="`Pinned contact`"
            >
              <Icon class="contact-list__pin-icon" :name="IconNameEnum.pin" />
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
          <template v-if="!topic.info.isPin"> Закрепить </template>
          <template v-else> Открепить </template>
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
        >
          <template v-if="topic.info.isMute"> Вкл. уведомление </template>
          <template v-else> Выкл. уведомление </template>
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
import {
  Avatar,
  Icon,
  IconNameEnum,
  Button,
  ButtonTypeEnum,
  SizesEnum,
  Loader
} from '@pksep/yui';
import ContextMenu from './ContextMenu.vue';
import MessageStatusIcons from '../Messages/MessageStatusIcons.vue';
import type { IContactListProps } from './interfaces/contact-list';
import { getAuthUser } from '../../composables/useAuth';
import { ITopic, MessageStatusEnum } from '../interfaces/interfaces';
import { useTopics } from '../../composables/useTopics';
import { formatTime } from '../../composables/useTime';
import { useResizeState } from '../../composables/useResizeState';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import { MAX_W_MD } from '../../utils/constants';
import {
  navigateToDialogs,
  navigateToGroup,
  useUrlWatcher
} from '../../composables/navigation';
import { getConfig } from '../../services/useConfig';

interface IExtendedContactListProps extends IContactListProps {
  showCheckbox?: boolean;
  selectedTopicIds?: Set<string | number>;
  isLoading?: boolean;
}

const route = useUrlWatcher();

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
    if (route.value && route.value.type === RouteTypes.DIALOGS) {
      navigateToDialogs(topic.id);
    } else if (route.value && route.value.type === RouteTypes.GROUP) {
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
</script>
