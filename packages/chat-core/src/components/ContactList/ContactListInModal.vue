<template>
  <section class="menu__info-users">
    <article>
      <Button
        :type="ButtonTypeEnum.secondary"
        class="button-menu__info menu__info-add-user"
        :size="SizesEnum.large"
      >
        <Icon :name="IconNameEnum.addUser" class="menu__info-add-user-icon" />
        Добавить участника
      </Button>
      <ul class="menu__info-users-list">
        <li><UserProfile /></li>
      </ul>
    </article>
  </section>
</template>

<script setup lang="ts">
import { Button, ButtonTypeEnum, Icon, IconNameEnum, SizesEnum } from 'sep-yui';
import UserProfile from '../UserProfile/UserProfile.vue';
</script>

<style lang="css" scoped>
@import url('../../assets/menu-info-users.css');

.menu__info-add-user {
  display: grid;
  place-content: center;
}

div.buttons-menu__info,
button.button-yui-kit.menu__info-add-user.large {
  width: 100%;
}

section.menu__info-users {
  padding: 10px;
}

.menu__info-users-list {
  display: grid;
  margin-top: 10px;
  gap: 8px;
}
</style>
