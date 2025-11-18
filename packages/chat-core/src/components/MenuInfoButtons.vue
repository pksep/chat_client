<template>
  <div class="menu-info__buttons">
    <Button
      :type="ButtonTypeEnum.secondary"
      :size="SizesEnum.large"
      class="menu-info__secondary-button"
    >
      <Icon :name="IconNameEnum.noDistrub" />
      Звук выкл.
    </Button>
    <Button
      :type="ButtonTypeEnum.secondary"
      :size="SizesEnum.large"
      class="menu-info__secondary-button"
    >
      <Icon :name="IconNameEnum.search" />
      Поиск
    </Button>
    <Button
      :type="ButtonTypeEnum.secondary"
      :size="SizesEnum.large"
      class="menu-info__secondary-button"
    >
      <Icon :name="IconNameEnum.logout" />
      Выйти
    </Button>
  </div>
</template>

<script lang="ts" setup>
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';
</script>
