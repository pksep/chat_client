<template>
  <ul class="contact-list">
    <li v-for="contact in props.contacts" :key="contact.id">
      <div
        :class="[
          'contact-list__item',
          { 'contact-list__item--active': isOpen[contact.id] }
        ]"
        @click.stop="handleClick(contact)"
        @contextmenu="openActivePopover(contact.id, $event)"
      >
        <Avatar
          class="contact-list__avatar"
          :initials="contact.title"
          :url="contact.imageURL"
          alt="avatar of contact image"
        />
        <h5 class="contact-list__title">{{ contact.title }}</h5>
        <div
          class="contact-list__description"
          v-html="contact.latestMessage"
        ></div>
        <div class="contact-list__top">
          <Icon
            v-if="contact.notificationCount === 0"
            :name="IconNameEnum.read"
            class="contact-list__read-icon"
          />
          <span v-if="contact.latestMessageTime" class="contact-list__time">{{
            useTime(new Date(contact.latestMessageTime))
          }}</span>
        </div>
        <div class="contact-list__bottom">
          <div
            v-if="
              contact.notificationCount > 0 &&
              (state.isNotificationEnabled[contact.id] ?? true)
            "
            class="contact-list__notification"
          >
            {{ contact.notificationCount }}
          </div>
          <div v-if="state.isPin[contact.id]">
            <Icon class="contact-list__pin-icon" :name="IconNameEnum.pin" />
          </div>
        </div>
      </div>
      <ContextMenu
        :visible="isOpen[contact.id]"
        :position="position"
        @unmount-close="() => closeActivePopover(contact.id)"
      >
        <Button
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          @click.stop="() => handlePin(contact.id)"
        >
          <template v-if="!state.isPin[contact.id]"> Закрепить </template>
          <template v-else> Открепить </template>
        </Button>
        <Button
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          @click="() => handleNotification(contact.id)"
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
import {
  Avatar,
  Icon,
  IconNameEnum,
  Button,
  ButtonTypeEnum,
  SizesEnum
} from 'sep-yui';
import ContextMenu from './ContextMenu.vue';
import { useContextMenu } from '../../composables/useContextMenu';

import type { IContactListProps } from './interfaces/contact-list';

const props = withDefaults(defineProps<IContactListProps>(), {});

const emits = defineEmits<{
  (e: 'unmount-notification', id: string): void;
  (e: 'unmount-click', id: string): void;
}>();

const { isOpen, position, openActivePopover, closeActivePopover } =
  useContextMenu();

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
  console.log(contact.latestMessageTime);
};

const handleNotification = (contactId: string): void => {
  const currentEnabled = state.isNotificationEnabled[contactId] ?? true;
  state.isNotificationEnabled[contactId] = !currentEnabled;
  emits('unmount-notification', contactId);
  closeActivePopover(contactId);
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
