<template>
  <aside class="menu">
    <div class="menu__profile">
      <UserProfile class="menu__user-profile" v-show="!state.isCollapse" />
      <Avatar
        url="/avatar-user.png"
        alt="avatar-user"
        v-show="state.isCollapse"
      />
      <YButton
        size="small"
        type="ghost"
        class="menu__user-profile-collapse"
        @click="handleCollapse"
      >
        <YIcon
          name="sidebar"
          width="1em"
          height="1em"
          class="menu__user-profile-collapse-icon"
        />
      </YButton>
    </div>
    <Line />
    <div class="menu__user-assistant">
      <div class="menu__user-assistant-icon">
        <AiIcon />
      </div>
      <h3 class="menu__user-assistant-title" v-if="!state.isCollapse">
        AI Ассистент
      </h3>
    </div>
    <Line v-if="state.isCollapse" />
    <details class="menu__user-details" v-if="!state.isCollapse">
      <summary class="menu__user-details-summary">
        <h4>Каналы</h4>
        <YIcon name="plus" />
      </summary>
      <ContactList />
    </details>
    <template v-if="state.isCollapse">
      <ul class="menu__user">
        <li>
          <Avatar />
          <Line />
        </li>
      </ul>
    </template>
  </aside>
</template>

<script lang="ts" setup>
import { reactive } from 'vue';
import AiIcon from '../components/AiIcon.vue';
import Avatar from './UserProfile/Avatar.vue';
import Line from './Line.vue';
import UserProfile from './UserProfile/UserProfile.vue';
import ContactList from './ContactList/ContactList.vue';

const state = reactive({
  isCollapse: false
});

const handleCollapse = (): void => {
  state.isCollapse = !state.isCollapse;
};
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

button.menu__user-profile-collapse {
  grid-area: c;
  display: grid;
  padding: 2px;
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
</style>
