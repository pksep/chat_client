<template>
  <ul class="contact-list">
    <li v-for="contact in props.contacts" :key="contact.id">
      <div
        :class="[
          'contact-list__item',
          { 'contact-list__item--active': isOpen[contact.id] }
        ]"
        @contextmenu="openActivePopover(contact.id, $event)"
      >
        <Avatar
          class="contact-list__avatar"
          :initials="contact.title"
          :url="contact.imageURL"
          alt="avatar of contact image"
        />
        <h5 class="contact-list__title">{{ contact.title }}</h5>
        <p class="contact-list__description">{{ contact.latestMessage }}</p>
        <div class="contact-list__top">
          <Icon
            v-if="contact.notificationCount === 0"
            :name="IconNameEnum.read"
            class="contact-list__read-icon"
          />
          <span class="contact-list__time">{{ useTime() }}</span>
        </div>
        <div class="contact-list__bottom">
          <div
            v-if="
              contact.notificationCount > 0 &&
              (isNotificationEnabled[contact.id] ?? true)
            "
            class="contact-list__notification"
          >
            {{ contact.notificationCount }}
          </div>
          <div v-if="contact.isPin">
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
          <template v-if="!contact.isPin"> Закрепить </template>
          <template v-else> Открепить </template>
        </Button>
        <Button
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          @click="() => handleNotification(contact.id)"
        >
          <template v-if="isNotificationEnabled[contact.id] ?? true">
            Выкл. уведомление
          </template>
          <template v-else> Вкл. уведомление </template>
        </Button>
      </ContextMenu>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { ref } from 'vue';
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
  (e: 'unmount-pin', id: string): void;
  (e: 'unmount-notification', id: string): void;
}>();

const { isOpen, position, openActivePopover, closeActivePopover } =
  useContextMenu();

const isNotificationEnabled = ref<Record<string, boolean>>({});

const handlePin = (contactId: string): void => {
  emits('unmount-pin', contactId);
  closeActivePopover(contactId);
};

const handleNotification = (contactId: string): void => {
  const currentEnabled = isNotificationEnabled.value[contactId] ?? true;
  isNotificationEnabled.value[contactId] = !currentEnabled;
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
