<template>
  <div class="menu-info__buttons">
    <Button
      :type="ButtonTypeEnum.secondary"
      :size="SizesEnum.large"
      class="menu-info__secondary-button"
      @click="handleMute"
    >
      <template v-if="state.topic.info.isMute">
        <Icon :name="IconNameEnum.noDistrub" />
        Звук выкл.
      </template>
      <template v-else>
        <Icon :name="IconNameEnum.distrub" />
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
import { computed, reactive } from 'vue';
import { useUrlWatcher } from '../composables/navigation';
import { getGroupList } from '../services/useGroup';
import { toggleMuteTopic } from '../composables/useTopics';

const { state: isMobile } = useResizeState(MAX_W_MD);

const route = useUrlWatcher();

const state = reactive({
  topic: computed(() => getGroupList().find(t => t.id === route.value.id))
});

const emits = defineEmits(['unmount-leave']);

const handleUnmountLeave = () => {
  emits('unmount-leave');
};

const handleMute = () => {
  toggleMuteTopic(state.topic.id);
};
</script>
