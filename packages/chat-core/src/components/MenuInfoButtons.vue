<template>
  <div class="menu-info__buttons">
    <Button
      :type="ButtonTypeEnum.secondary"
      :size="SizesEnum.large"
      class="menu-info__secondary-button"
      @click="handleMute(!state.isMuted)"
    >
      <template v-if="state.isMuted">
        <Icon :name="IconNameEnum.noDistrub" />
        Звук выкл.
      </template>
      <template v-else>
        <!-- <Icon :name="IconNameEnum.distrub" /> -->
        Звук вкл.
      </template>
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
import { reactive } from 'vue';

const { state: isMobile } = useResizeState(MAX_W_MD);

const state = reactive({
  isMuted: false
});

const emits = defineEmits(['unmount-leave', 'unmount-mute']);

const handleUnmountLeave = () => {
  emits('unmount-leave');
};

const handleMute = (mute: boolean) => {
  state.isMuted = mute;
  emits('unmount-mute', mute);
};
</script>
