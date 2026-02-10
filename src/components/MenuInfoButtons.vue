<template>
  <div class="menu-info__buttons">
    <Button
      v-if="state.topic"
      :type="ButtonTypeEnum.secondary"
      :size="SizesEnum.large"
      class="menu-info__secondary-button"
      @click="handleMute"
    >
      <template v-if="state.topic.info?.isMute">
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
      @click="handleOpenModal"
    >
      <Icon
        :name="
          currentGroup.isAdmin ? IconNameEnum.deleteSmall : IconNameEnum.logout
        "
      />
      {{ currentGroup.isAdmin ? 'Удалить канал' : 'Выйти' }}
    </Button>
  </div>

  <ConfirmModal
    :open="state.openModal"
    :title="currentGroup.isAdmin ? 'Удаление канала' : 'Выход из канала'"
    :description="
      currentGroup?.isAdmin
        ? 'Вы уверены, что хотите удалить канал?'
        : 'Вы уверены, что хотите покинуть канал?'
    "
    @unmount-close="handleCloseModal"
    @unmount-confirm="handleUnmountLeave"
  />
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
import { currentGroup, useGroup } from '../composables/useGroup';
import { useTopics } from '../composables/useTopics';
import ConfirmModal from './UI/ConfirmModal.vue';

const { state: isMobile } = useResizeState(MAX_W_MD);

const route = useUrlWatcher();

const state = reactive({
  topic: computed(() => {
    const { getGroupList } = useGroup();
    return getGroupList().find(t => t.id === route.value.id);
  }),
  openModal: false
});

const emits = defineEmits(['unmount-leave']);

const handleOpenModal = () => {
  state.openModal = true;
};

const handleCloseModal = () => {
  state.openModal = false;
};

const handleUnmountLeave = () => {
  emits('unmount-leave');
};

const handleMute = () => {
  const { toggleMuteTopic } = useTopics();
  toggleMuteTopic(state.topic);
};
</script>
