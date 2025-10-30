<template>
  <ul class="contact-list">
    <li v-for="(contact, inx) in props.contacts" :key="inx">
      <div :class="activeContactStyles" @contextmenu="openActivePopover">
        <Avatar
          class="contact-list__avatar"
          :initials="contact.title"
          :url="contact.imageURL"
          alt="avatar of contanct image"
        />
        <h5 class="contact-list__title">{{ contact.title }}</h5>
        <p class="contact-list__description">{{ contact.latestMessage }}</p>
        <div class="contact-list__top">
          <Icon
            v-if="state.read"
            :name="IconNameEnum.read"
            class="contact-list__read-icon"
          />
          <span class="contact-list__time">{{ useTime() }}</span>
        </div>
        <div class="contact-list__bottom">
          <div
            v-if="contact.notificationCount > 0 && state.notification"
            class="contact-list__notification"
          >
            {{ contact.notificationCount }}
          </div>
          <div v-if="contact.isPin">
            <Icon class="contact-list__pin-icon" :name="IconNameEnum.pin" />
          </div>
        </div>
      </div>
    </li>
    <ContextMenu
      :visible="isOpen"
      :position="position"
      @unmount-close="closeActivePopover"
    >
      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.small"
        @click.stop="handlePin"
      >
        <template v-if="!state.pin"> Закрепить </template>
        <template v-else> Открепить </template>
      </Button>
      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.small"
        @click="handleNotification"
      >
        <template v-if="!state.notification"> Выкл. уведомление </template>
        <template v-else> Вкл. уведомление </template>
      </Button>
    </ContextMenu>
  </ul>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
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

const state = reactive({
  pin: false,
  read: false,
  notification: false
});

const props = withDefaults(defineProps<IContactListProps>(), {});

const { isOpen, position, openActivePopover, closeActivePopover } =
  useContextMenu();

const activeContactStyles = computed(() => [
  'contact-list__item',
  { 'contact-list__item--active': isOpen }
]);

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

const handlePin = (): void => {
  state.pin = !state.pin;
  closeActivePopover();
};

const handleNotification = (): void => {
  state.notification = !state.notification;
  closeActivePopover();
};
</script>
