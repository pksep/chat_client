<template>
  <aside class="menu__info">
    <header class="menu__info-header">
      <h4>Общий</h4>
      <Button :type="ButtonTypeEnum.ghost" :size="SizesEnum.small">
        <Icon :name="IconNameEnum.crossLarge" />
      </Button>
    </header>
    <Tabs :tabCount="2">
      <template #header1>
        <span class="menu__info-user">
          Участники
          <div class="menu__info-user-count">8</div>
        </span>
      </template>
      <template #header2> Информация </template>
      <template #tab1>
        <section class="menu__info-users">
          <article>
            <Button
              :type="ButtonTypeEnum.outline"
              class="menu__info-add-user"
              :size="SizesEnum.large"
            >
              <Icon
                :name="IconNameEnum.addUser"
                class="menu__info-add-user-icon"
              />
              Добавить участника
            </Button>
            <ul class="menu__info-users-list">
              <li><UserProfile /></li>
            </ul>
          </article>
        </section>
      </template>
      <template #tab2>
        <section class="menu__info-info"></section>
      </template>
    </Tabs>
  </aside>
</template>

<script lang="ts" setup>
import {
  Tabs,
  Button,
  ButtonTypeEnum,
  IconNameEnum,
  SizesEnum,
  Icon
} from 'sep-yui';
import UserProfile from './UserProfile/UserProfile.vue';
</script>

<style scoped>
aside.menu__info {
  background-color: var(--white);
  border-left-color: var(--border-grey);
  border-left-width: 0.5px;
  border-left-style: solid;
}

header.menu__info-header {
  display: flex;
  padding: 10px;
  align-items: center;
  justify-content: space-between;
}

section.menu__info-users {
  padding: 10px;
}

.menu__info-user {
  display: flex;
  margin: 0;
  align-items: center;
  padding-bottom: 7px;
  border-bottom: 1px solid black;
}

.menu__info-add-user {
  display: grid;
  place-content: center;
}

.menu__info-user-count {
  display: grid;
  margin-left: 4px;
  place-content: center;
  border-radius: 50%;
  background-color: var(--blue12);
  color: var(--text-black);
  font-size: 12px;
  font-weight: semi-bold;
  line-height: 100%;
  width: 20px;
  height: 20px;
}

button.button-yui-kit.menu__info-add-user.large {
  display: grid;
  justify-items: center;
  min-height: 65px;
  border-width: 0;
  background-color: var(--blue15);
  font-size: 14px;
  width: 100%;
  padding-block: 10px;
  line-height: 100%;
  & svg.icon-yui-kit.menu__info-add-user-icon {
    color: var(--grey5);
    font-size: 24px;
  }
}

.menu__info-users-list {
  display: grid;
  margin-top: 10px;
  gap: 8px;
}

:deep(button.tabs__navigation-button) {
  display: flex;
  align-items: center;
  margin: 0 !important;
  &:hover,
  &.active {
    text-decoration: none !important;
  }
}
</style>
