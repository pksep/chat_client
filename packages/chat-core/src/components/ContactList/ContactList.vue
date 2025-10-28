<template>
  <ul class="contact-list">
    <li>
      <div :class="activeContactStyles" @contextmenu="openActivePopover">
        <Avatar class="contact-list__avatar" initials="Orange" />
        <h5 class="contact-list__title">Общий</h5>
        <p class="contact-list__description">Ok, see you later</p>
        <div class="contact-list__top">
          <Icon
            v-if="state.read"
            :name="IconNameEnum.read"
            class="contact-list__read-icon"
          />
          <span class="contact-list__time">{{ useTime() }}</span>
        </div>
        <div class="contact-list__bottom">
          <div v-if="state.notification" class="contact-list__notification">
            1
          </div>
          <div v-if="state.pin">
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

const state = reactive({
  pin: false,
  read: false,
  notification: false
});

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

<style lang="css" scoped>
.contact-list__item {
  display: grid;
  grid-template-columns: 30px auto;
  column-gap: 10px;
  padding-block: 10px;
  min-height: 58px;
  grid-template-areas:
    'a b c'
    'a d f';
  &:hover,
  &.contact-list__item--active {
    cursor: pointer;
    background-color: var(--blue15);
  }
}

.contact-list__title {
  grid-area: b;
  margin: 0;
  font-size: 16px;
  color: var(--text-black);
  font-weight: 600;
  justify-self: start;
}

.contact-list__avatar {
  grid-area: a;
  align-self: center;
}

.contact-list__description {
  grid-area: d;
  margin: 0;
  justify-self: start;
  height: 19px;
  color: var(--text-grey);
}

.contact-list__notification {
  color: var(--white);
  font-size: 12px;
  height: 18px;
  width: 18px;
  border-radius: 50%;
  background-color: var(--blue4);
}

svg.icon-yui-kit.contact-list__pin-icon {
  color: var(--grey5);
  font-size: 16px;
}

svg.icon-yui-kit.contact-list__read-icon {
  color: var(--blue1);
  font-size: 16px;
}

.contact-list__top {
  grid-area: c;
  display: flex;
  gap: 7px;
  align-items: center;
  justify-self: end;
}

.contact-list__time {
  color: var(--text-grey);
  font-size: 12px;
  line-height: 16px;
}

.contact-list__bottom {
  grid-area: f;
  justify-self: end;
  display: flex;
  place-content: center;
  text-align: center;
}

.contact-list {
  gap: 10px;
  display: grid;
}
</style>
