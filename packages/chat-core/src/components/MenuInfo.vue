<template>
  <aside class="menu__info">
    <header class="menu__info-header">
      <h4>Общий</h4>
      <Button :type="ButtonTypeEnum.ghost" :size="SizesEnum.small">
        <Icon :name="IconNameEnum.crossLarge" />
      </Button>
    </header>
    <Tabs :tabCount="2">
      <template #header2>
        <span class="menu__info-user">
          Участники
          <div class="menu__info-user-count">8</div>
        </span>
      </template>
      <template #header1> Информация </template>
      <template #tab2>
        <section class="menu__info-users">
          <article>
            <Button
              :type="ButtonTypeEnum.secondary"
              class="button-menu__info menu__info-add-user"
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
      <template #tab1>
        <section class="menu__info-info">
          <div class="menu__info-create-channel">
            <p class="menu__info-title-text">Канал создан:</p>
            <span>
              {{ new Date().toLocaleDateString('ru-RU') }}
            </span>
          </div>
          <div class="menu__info-avatar">
            <Avatar is-icon />
          </div>
          <div class="buttons-menu__info">
            <Button
              :type="ButtonTypeEnum.secondary"
              :size="SizesEnum.large"
              class="button-menu__info"
            >
              <Icon :name="IconNameEnum.noDistrub" />
              Звук выкл.
            </Button>
            <Button
              :type="ButtonTypeEnum.secondary"
              :size="SizesEnum.large"
              class="button-menu__info"
            >
              <Icon :name="IconNameEnum.logout" />
              Выйти
            </Button>
          </div>
          <form class="menu__info-form">
            <div class="menu__info-form-block">
              <label class="menu__info-title-text"> Название: </label>
              <Input class="initial" type="text" placeholder="Text" />
            </div>
            <div class="menu__info-form-block">
              <label class="menu__info-title-text"> Описание: </label>
              <Textarea :type="`initial`" placeholder="Text" />
            </div>
            <Button
              class="menu__info-save-button"
              :type="ButtonTypeEnum.primary"
              :size="SizesEnum.little"
              disabled
            >
              Сохранить
            </Button>
          </form>
        </section>
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
  Icon,
  Input,
  Textarea,
  Avatar
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

section.menu__info-info,
section.menu__info-users {
  padding: 10px;
}

section.menu__info-info {
  padding-inline: 20px;
  display: grid;
  gap: 10px;
}

.menu__info-user {
  display: flex;
  margin: 0;
  align-items: center;
  padding-bottom: 7px;
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

button.button-yui-kit.secondary-yui-kit.large.button-menu__info {
  display: grid;
  justify-items: center;
  min-height: 65px;
  font-size: 14px;
  color: var(--text-black);
  padding-block: 10px;
  line-height: 100%;
  & svg.icon-yui-kit {
    color: var(--grey5);
    font-size: 24px;
  }
}

div.buttons-menu__info,
button.button-yui-kit.menu__info-add-user.large {
  width: 100%;
}

.menu__info-users-list {
  display: grid;
  margin-top: 10px;
  gap: 8px;
}

:deep(button.tabs__navigation-button) {
  display: flex;
  align-items: center;
}

div.buttons-menu__info {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.menu__info-form {
  display: grid;
  gap: 10px;
  & button.menu__info-save-button {
    justify-self: end;
  }
}

.menu__info-title-text {
  color: var(--text-grey);
  font-weight: 600;
  font-size: 14px;
}

.menu__info-create-channel {
  display: flex;
  align-items: center;
  font-size: 14px;
  gap: 5px;
  & p {
    padding-block: 10px;
    margin: 0;
  }
  & span {
    font-weight: normal;
    color: var(--text-black);
  }
}

.menu__info-avatar {
  display: flex;
  width: 100%;
  justify-content: center;
}

.menu__info-form-block {
  display: grid;
  gap: 5px;
}
</style>
