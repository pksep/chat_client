<template>
  <form class="menu__info-form">
    <div class="menu__info-form-block">
      <label for="name" class="menu__info-title-text"> Название: </label>
      <Input id="name" class="initial" type="text" placeholder="Text" />
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
</template>

<script setup lang="ts">
import { Button, ButtonTypeEnum, Input, SizesEnum, Textarea } from 'sep-yui';
</script>

<style scoped>
@import url('../../assets/menu-info-users.css');

.menu__info-form-block {
  display: grid;
  gap: 5px;
}

.menu__info-form {
  display: grid;
  gap: 10px;
  & button.menu__info-save-button {
    justify-self: end;
  }
}
</style>
