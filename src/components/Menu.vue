<template>
  <aside class="menu">
    <div class="menu__profile">
      <UserProfile class="menu__user-profile" />
      <button class="menu__user-profile-collapse">
        <YIcon
          name="sidebar"
          width="1em"
          height="1em"
          class="menu__user-profile-collapse-icon"
        />
      </button>
    </div>
    <div class="menu__user-line"></div>
    <div class="menu__user-assistant">
      <div class="menu__user-assistant-icon">
        <AiIcon />
      </div>
      <h3 class="menu__user-assistant-title">AI Ассистент</h3>
    </div>
    <details class="menu__user-details">
      <summary class="menu__user-details-summary">
        <h4>Каналы</h4>
        <YIcon name="plus" />
      </summary>
      <ul class="user__contact-list">
        <li>
          <div class="menu__user-contact">
            <Avatar class="menu__user-contact-profile" />
            <h5 class="user__contact-title">Общий</h5>
            <p class="user__contact-description">Ok, see you later</p>
            <div class="user__contact-top__left">
              <YIcon v-if="read" name="read" class="user__contact-read" />
              <span class="user__contact-time">{{ useTime() }}</span>
            </div>
            <div
              v-if="notification"
              class="user__contact-bottom__left user__contact-notification"
            >
              1
            </div>
            <div class="user__contact-bottom__left" v-if="pin">
              <YIcon class="user__contact-pin" name="pin" />
            </div>
          </div>
        </li>
      </ul>
    </details>
  </aside>
</template>

<script lang="ts" setup>
import AiIcon from '../components/AiIcon.vue';
import Avatar from './UserProfile/Avatar.vue';
import UserProfile from './UserProfile/UserProfile.vue';

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

<style scoped>
.menu {
  display: grid;
  align-content: start;
  padding: 20px;
  border-right-width: 0.5px;
  border-right-style: solid;
  border-right-color: var(--grey13);
  background-color: var(--white);
  overflow-y: auto;
  gap: 10px;
}

.menu__profile {
  display: grid;
  width: 100%;
  align-items: center;
  grid-template-areas:
    'profile c'
    'profile c';
}

.menu__user-profile {
  grid-area: profile;
}

.menu__user-profile-collapse {
  grid-area: c;
  display: grid;
  align-items: center;
  color: var(--grey4);
  background-color: var(--white);
  justify-self: end;
}

.menu__user-profile-collapse-icon {
  background-color: var(--white);
}

.menu__user-assistant {
  padding: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.menu__user-line {
  margin-top: 5px;
  border-top-width: 1px;
  border-top-style: solid;
  border-top-color: var(--grey13);
  width: 100%;
}

.menu__user-assistant-title {
  color: var(--text-black);
  font-size: 14px;
}

.menu__user-assistant-icon {
  display: grid;
  background-color: var(--blue9);
  color: var(--blue1);
  border-radius: 50%;
  padding: 7px;
  & svg {
    font-size: 16px;
  }
}

details.menu__user-details {
  padding-inline: 10px;
  &:not([open]) summary.menu__user-details-summary h4::after {
    transform: rotate(180deg);
  }
}

summary.menu__user-details-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  color: var(--text-grey);
  &::marker {
    display: none;
  }
  & svg {
    font-size: 12px;
  }
  & h4 {
    margin: 0;
  }
  & h4::after {
    display: inline-block;
    content: '▾';
    margin-left: 6px;
    transition: transform 0.3s ease;
  }

  font-weight: bold;
}

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
  list-style: none;
  padding: 0;
  margin: 0;
}
</style>
