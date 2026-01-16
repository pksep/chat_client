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
            'contact-list__item--active': topic.id === props.selectedTopicId
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
          :url="topic.avatarUrl"
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
            v-html="topic.lastMessage || '--'"
          ></div>
          <div class="contact-list__top">
            <MessageStatusIcons
              v-if="topic.lastMessage?.senderUserId === state.authedUser.id"
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
              :aria-label="`Last message at ${useTime(new Date(topic.lastMessage?.createdAt))}`"
            >
              {{ useTime(new Date(topic.lastMessage?.createdAt)) }}
            </span>
          </div>
          <div class="contact-list__bottom">
            <div
              v-if="topic.lastMessage?.status !== MessageStatusEnum.READ"
              class="contact-list__notification"
              :data-testid="`${props.dataTestid}-ContactList-Notification${index + 1}`"
              :aria-label="`${1} new messages`"
            >
              {{ 1 }}
            </div>
            <div
              v-if="state.isPin[topic.id]"
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
            state.isPin[topic.id] ? `Unpin ${topic.name}` : `Pin ${topic.name}`
          "
        >
          <template v-if="!state.isPin[topic.id]"> Закрепить </template>
          <template v-else> Открепить </template>
        </Button>
        <Button
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          @click="() => handleNotification(topic.id)"
          :data-testid="`${props.dataTestid}-ContactList-NotificationButton${index + 1}`"
          :aria-label="
            state.isNotificationEnabled[topic.id]
              ? `Disable notifications for ${topic.name}`
              : `Enable notifications for ${topic.name}`
          "
        >
          <template v-if="state.isNotificationEnabled[topic.id] ?? true">
            Выкл. уведомление
          </template>
          <template v-else> Вкл. уведомление </template>
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
import { reactive, watch, computed } from 'vue';
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
import { togglePinTopic } from '../../composables/useTopics';
import { useTime } from '../../composables/useTime';

interface IExtendedContactListProps extends IContactListProps {
  showCheckbox?: boolean;
  selectedTopicIds?: Set<string | number>;
  isLoading?: boolean;
}

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

const { isOpen, position, openActivePopover, closeActivePopover } =
  useContextMenu();

const state = reactive({
  isPin: {} as Record<string, boolean>,
  isNotificationEnabled: {} as Record<string, boolean>,
  authedUser: computed(() => getAuthUser())
});

watch(
  () => props.topics,
  topics => {
    if (topics) {
      topics.forEach(topic => {
        state.isPin[topic.id] = topic.info?.isPin;
      });
    }
  },
  { immediate: true }
);

const handlePin = (contact: ITopic): void => {
  togglePinTopic(contact.id);
  closeActivePopover(contact.id);
};

const handleClick = (topic: ITopic): void => {
  emits('unmount-topic', topic);
};

const handleNotification = (contactId: string): void => {
  const currentEnabled = state.isNotificationEnabled[contactId] ?? true;
  state.isNotificationEnabled[contactId] = !currentEnabled;
  emits('unmount-notification', contactId);
  closeActivePopover(contactId);
};

const handleKeyDown = (contact: ITopic, event: KeyboardEvent): void => {
  if (event.key === 'Enter' || event.key === ' ') {
    handleClick(contact);
  }
};
</script>
