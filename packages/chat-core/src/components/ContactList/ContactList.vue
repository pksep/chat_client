<template>
  <ul
    class="contact-list"
    role="list"
    :data-testid="`${props.dataTestid}-ContactList-List`"
    :aria-label="`${props.dataTestid} Contact List`"
  >
    <li
      v-for="(contact, index) in props.contacts"
      :key="contact.id"
      role="listitem"
      tabindex="0"
      @keydown="event => handleKeyDown(contact, event)"
      :data-testid="`${props.dataTestid}-ContactList-Item${index + 1}`"
    >
      <div
        :class="[
          'contact-list__item',
          { 'contact-list__item--active': isOpen[contact.id] }
        ]"
        role="button"
        tabindex="0"
        :aria-label="`Contact ${contact.name}, ${contact.latestMessage ? contact.latestMessage : 'no recent message'}`"
        :aria-expanded="isOpen[contact.id] ? 'true' : 'false'"
        :aria-haspopup="true"
        @click.stop="handleClick(contact)"
        @contextmenu="openActivePopover(contact.id, $event)"
        @keydown.enter="handleClick(contact)"
        @keydown.space="handleClick(contact)"
      >
        <Avatar
          class="contact-list__avatar"
          :initials="contact.name"
          :url="contact.avatarUrl"
          :alt="`Avatar of ${contact.name}`"
          :data-testid="`${props.dataTestid}-ContactList-Avatar${index + 1}`"
        />
        <h5
          role="heading"
          aria-level="5"
          class="contact-list__title"
          :data-testid="`${props.dataTestid}-ContactList-Title${index + 1}`"
        >
          {{ contact.name }}
        </h5>
        <div
          class="contact-list__description"
          :data-testid="`${props.dataTestid}-ContactList-Description${index + 1}`"
          :aria-label="`Latest message: ${contact.latestMessage || 'No message'}`"
          v-html="contact.latestMessage"
        ></div>
        <div class="contact-list__top">
          <Icon
            v-if="contact.isRead"
            :name="IconNameEnum.read"
            class="contact-list__read-icon"
            :aria-label="contact.isRead ? 'Message read' : 'Message unread'"
            :data-testid="`${props.dataTestid}-ContactList-ReadIcon${index + 1}`"
          />
          <span
            v-if="contact.latestMessageTime"
            class="contact-list__time"
            :data-testid="`${props.dataTestid}-ContactList-Time${index + 1}`"
            :aria-label="`Last message at ${useTime(new Date(contact.latestMessageTime))}`"
          >
            {{ useTime(new Date(contact.latestMessageTime)) }}
          </span>
        </div>
        <div class="contact-list__bottom">
          <div
            v-if="
              contact.notificationCount > 0 &&
              (state.isNotificationEnabled[contact.id] ?? true)
            "
            class="contact-list__notification"
            :data-testid="`${props.dataTestid}-ContactList-Notification${index + 1}`"
            :aria-label="`${contact.notificationCount} new messages`"
          >
            {{ contact.notificationCount }}
          </div>
          <div
            v-if="state.isPin[contact.id]"
            :data-testid="`${props.dataTestid}-ContactList-Pin${index + 1}`"
            :aria-label="`Pinned contact`"
          >
            <Icon class="contact-list__pin-icon" :name="IconNameEnum.pin" />
          </div>
        </div>
      </div>
      <Line
        v-if="isMobile"
        class="menu__user-line"
        :data-testid="`${props.dataTestid}-AIAssistant-Line`"
      />
      <ContextMenu
        :visible="!!isOpen[contact.id]"
        :position="position"
        :data-testid="`${props.dataTestid}-ContactList-ContextMenu${index + 1}`"
        @unmount-close="() => closeActivePopover(contact.id)"
      >
        <Button
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          @click.stop="() => handlePin(contact.id)"
          :data-testid="`${props.dataTestid}-ContactList-PinButton${index + 1}`"
          :aria-label="
            state.isPin[contact.id]
              ? `Unpin ${contact.name}`
              : `Pin ${contact.name}`
          "
        >
          <template v-if="!state.isPin[contact.id]"> Закрепить </template>
          <template v-else> Открепить </template>
        </Button>
        <Button
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          @click="() => handleNotification(contact.id)"
          :data-testid="`${props.dataTestid}-ContactList-NotificationButton${index + 1}`"
          :aria-label="
            state.isNotificationEnabled[contact.id]
              ? `Disable notifications for ${contact.name}`
              : `Enable notifications for ${contact.name}`
          "
        >
          <template v-if="state.isNotificationEnabled[contact.id] ?? true">
            Выкл. уведомление
          </template>
          <template v-else> Вкл. уведомление </template>
        </Button>
      </ContextMenu>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue';
import { useContextMenu } from '../../composables/useContextMenu';
import { useResizeState } from '../../composables/useResizeState';
import {
  Avatar,
  Icon,
  IconNameEnum,
  Button,
  ButtonTypeEnum,
  SizesEnum
} from '@pksep/yui';
import ContextMenu from './ContextMenu.vue';
import Line from '../../components/Line.vue';
import type { IContactListProps } from './interfaces/contact-list';
import { MAX_W_MD } from '../../utils/constants';

const props = withDefaults(defineProps<IContactListProps>(), {});

const emits = defineEmits<{
  (e: 'unmount-notification', id: string): void;
  (e: 'unmount-click', id: string): void;
}>();

const { isOpen, position, openActivePopover, closeActivePopover } =
  useContextMenu();

const { state: isMobile } = useResizeState(MAX_W_MD);

const state = reactive({
  isPin: {} as Record<string, boolean>,
  isNotificationEnabled: {} as Record<string, boolean>
});

watch(
  () => props.contacts,
  contacts => {
    if (contacts) {
      contacts.forEach(contact => {
        state.isPin[contact.id] = contact.isPin;
      });
    }
  },
  { immediate: true }
);

const handlePin = (contactId: string): void => {
  const currentPin = state.isPin[contactId] ?? false;
  state.isPin[contactId] = !currentPin;
  closeActivePopover(contactId);
};

const handleClick = (contact): void => {
  emits('unmount-click', contact);
};

const handleNotification = (contactId: string): void => {
  const currentEnabled = state.isNotificationEnabled[contactId] ?? true;
  state.isNotificationEnabled[contactId] = !currentEnabled;
  emits('unmount-notification', contactId);
  closeActivePopover(contactId);
};

const handleKeyDown = (contact: any, event: KeyboardEvent): void => {
  if (event.key === 'Enter' || event.key === ' ') {
    handleClick(contact);
  }
};

const useTime = (date: Date = new Date()): string => {
  let hours: string | number = date.getHours();
  let minutes: string | number = date.getMinutes();
  if (hours < 10) {
    hours = `0${hours}`;
  }
  if (minutes < 10) {
    minutes = `0${minutes}`;
  }
  return `${hours}:${minutes}`;
};
</script>
