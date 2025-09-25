<template>
  <ul class="user__contact-list">
    <li>
      <div class="menu__user-contact">
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
  </ul>
</template>

<script setup lang="ts">
import { Avatar, Icon, IconNameEnum } from 'sep-yui';

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
</script>

<style lang="css" scoped>
.menu__user-contact {
  display: grid;
  grid-template-columns: 30px auto;
  column-gap: 10px;
  grid-template-areas:
    'a b c'
    'a d f';
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
</style>
