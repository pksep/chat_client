<template>
  <ul class="user__contact-list">
    <li>
      <div
        :class="['menu__user-contact', { active: state.isActive }]"
        @contextmenu.prevent="openActivePopover"
      >
        <Avatar class="menu__user-contact-profile" initials="Orange" />
        <h5 class="user__contact-title">Общий</h5>
        <p class="user__contact-description">Ok, see you later</p>
        <div class="user__contact-top__left">
          <Icon
            v-if="read"
            :name="IconNameEnum.read"
            class="user__contact-read"
          />
          <span class="user__contact-time">{{ useTime() }}</span>
        </div>
        <div
          v-if="notification"
          class="user__contact-bottom__left user__contact-notification"
        >
          1
        </div>
        <div class="user__contact-bottom__left" v-if="pin">
          <Icon class="user__contact-pin" :name="IconNameEnum.pin" />
        </div>
      </div>
    </li>
    <div
      v-if="state.isActive"
      ref="menuRef"
      :style="{
        left: state.menuPosition.x + 'px',
        top: state.menuPosition.y + 'px'
      }"
      class="context-menu"
      @click.stop
    >
      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        @click="handleEdit"
      >
        Edit
      </Button>
      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        @click="handleDelete"
      >
        Delete
      </Button>
    </div>
  </ul>
</template>

<script setup lang="ts">
import {
  Avatar,
  Icon,
  IconNameEnum,
  Button,
  ButtonTypeEnum,
  SizesEnum,
  VueToolsCore
} from 'sep-yui';
import { reactive, ref } from 'vue';

const state = reactive({
  isActive: false,
  menuPosition: { x: 0, y: 0 },
  ignoreNextClick: false
});

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

const notification = false;
const pin = false;
const read = false;

const menuRef = ref(null);

const openActivePopover = (event: MouseEvent): void => {
  state.menuPosition = { x: event.pageX, y: event.pageY };
  state.isActive = true;
};

const closePopover = (): void => {
  state.isActive = false;
};

VueToolsCore.onClickOutside(menuRef, closePopover);

const handleEdit = (): void => {
  console.log('Edit contact');
  closePopover();
};

const handleDelete = (): void => {
  console.log('Delete contact');
  closePopover();
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
  display: grid;
  place-content: center;
  text-align: center;
}

.user__contact-list {
  gap: 10px;
  display: grid;
}

.context-menu {
  position: absolute;
  background: var(--white);
  border: 1px solid var(--grey3);
  border-radius: 4px;
  padding: 4px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  min-width: 120px;
}

.context-menu Button {
  width: 100%;
  justify-content: flex-start;
  margin-bottom: 4px;
  text-align: left;
}

.context-menu Button:last-child {
  margin-bottom: 0;
}
</style>
