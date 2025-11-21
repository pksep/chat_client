<template>
  <div class="menu-info__buttons">
    <Button
      :type="ButtonTypeEnum.secondary"
      :size="SizesEnum.large"
      class="menu-info__secondary-button"
      @click="handleMute"
    >
      <Icon :name="IconNameEnum.noDistrub" />
      Звук выкл.
    </Button>
    <Button
      v-if="isMobile"
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
      @click="handleUnmountLeave"
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

import { MAX_W_MD } from '../utils/constants';
import { useResizeState } from '../composables/useResizeState';

const { state: isMobile } = useResizeState(MAX_W_MD);

const emits = defineEmits(['unmount-leave', 'unmount-notify']);

const handleUnmountLeave = () => {
  emits('unmount-leave');
};

const handleMute = () => {
  emits('unmount-notify');
};
</script>
