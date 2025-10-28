<template>
  <ul class="user__contact-list">
    <li>
      <div
        :class="['menu__user-contact', { active: isOpen }]"
        @contextmenu="openActivePopover"
      >
        <Avatar class="menu__user-contact-profile" initials="Orange" />
        <h5 class="user__contact-title">Общий</h5>
        <p class="user__contact-description">Ok, see you later</p>
        <div class="user__contact-top__left">
          <Icon
            v-if="state.read"
            :name="IconNameEnum.read"
            class="user__contact-read"
          />
          <span class="user__contact-time">{{ useTime() }}</span>
        </div>
        <div class="user__contact-bottom__left">
          <div v-if="state.notification" class="user__contact-notification">
            1
          </div>
          <div v-if="state.pin">
            <Icon class="user__contact-pin" :name="IconNameEnum.pin" />
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
import { reactive } from 'vue';
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

const state = reactive({
  pin: false,
  read: false,
  notification: false
});

const { isOpen, position, openActivePopover, closeActivePopover } =
  useContextMenu();

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
