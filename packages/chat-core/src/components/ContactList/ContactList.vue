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

<style lang="css" scoped>
.menu__user-contact {
  display: grid;
  grid-template-columns: 30px auto;
  column-gap: 10px;
  padding-block: 10px;
  grid-template-areas:
    'a b c'
    'a d f';
  &:hover,
  &.active {
    background-color: var(--blue15);
  }
}

.user__contact-title {
  grid-area: b;
  margin: 0;
  font-size: 16px;
  color: var(--text-black);
  font-weight: 600;
  justify-self: start;
}

.menu__user-contact-profile {
  grid-area: a;
  align-self: center;
}

.user__contact-description {
  grid-area: d;
  margin: 0;
  justify-self: start;
  color: var(--text-grey);
}

.user__contact-notification {
  color: var(--white);
  font-size: 12px;
  height: 18px;
  width: 18px;
  border-radius: 50%;
  background-color: var(--blue4);
}

svg.icon-yui-kit.user__contact-pin {
  color: var(--grey5);
  font-size: 16px;
}

svg.icon-yui-kit.user__contact-read {
  color: var(--blue1);
  font-size: 16px;
}

.user__contact-top__left {
  grid-area: c;
  display: flex;
  gap: 7px;
  align-items: center;
  justify-self: end;
}

.user__contact-time {
  color: var(--text-grey);
  font-size: 12px;
  line-height: 16px;
}

.user__contact-bottom__left {
  grid-area: f;
  justify-self: end;
  display: flex;
  gap: 2px;
  place-content: center;
  text-align: center;
}

.user__contact-list {
  gap: 10px;
  display: grid;
}
</style>
