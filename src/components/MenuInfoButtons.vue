<template>
  <div
    class="menu-info__buttons"
    :data-testid="`${props.dataTestid}-Container`"
  >
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
      :type="ButtonTypeEnum.secondary"
      :size="SizesEnum.large"
      class="menu-info__secondary-button"
      @click="handleCall"
    >
      <CallIcon class="menu-info__call-icon" />
      Звонок
    </Button>
    <Button
      v-if="activeGroup"
      :type="ButtonTypeEnum.secondary"
      :size="SizesEnum.large"
      class="menu-info__secondary-button"
      @click="handleOpenModal"
    >
      <Icon
        :name="
          showDeleteAction ? IconNameEnum.deleteSmall : IconNameEnum.logout
        "
      />
      {{ showDeleteAction ? 'Удалить группу' : 'Выйти' }}
    </Button>
  </div>

  <ConfirmModal
    :open="state.openModal"
    :title="showDeleteAction ? 'Удаление группы' : 'Выход из группы'"
    :description="
      showDeleteAction
        ? 'Вы уверены, что хотите удалить группу?'
        : 'Вы уверены, что хотите покинуть группу?'
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
import CallIcon from './CallModal/UI/CallIcon.vue';

const { state: isMobile } = useResizeState(MAX_W_MD);
const props = withDefaults(defineProps<{ dataTestid?: string }>(), {
  dataTestid: 'MenuInfoButtons'
});

const route = useUrlWatcher();

const state = reactive({
  topic: computed(() => {
    const { getGroupList } = useGroup();
    return getGroupList().find(t => t.id === route.value.id);
  }),
  openModal: false
});
const activeGroup = computed(() => {
  if (currentGroup.value?.id === route.value.id) {
    return currentGroup.value;
  }

  return state.topic || null;
});
const activeGroupIsAdmin = computed(() => !!activeGroup.value?.isAdmin);
const showDeleteAction = computed(
  () => activeGroupIsAdmin.value && !isMobile.value
);

const emits = defineEmits(['unmount-leave', 'unmount-open-chat']);

const handleOpenModal = () => {
  if (!activeGroup.value) {
    return;
  }

  state.openModal = true;
};

const handleCloseModal = () => {
  state.openModal = false;
};

const handleUnmountLeave = () => {
  emits('unmount-leave');
};

const handleCall = async () => {
  const groupId = route.value.id;

  if (!groupId) {
    return;
  }

  emits('unmount-open-chat');
  const { startLiveKitGroupCall } = await import('../services/useLiveKit');

  await startLiveKitGroupCall(groupId);
};

const handleMute = () => {
  const { toggleMuteTopic } = useTopics();
  toggleMuteTopic(state.topic);
};
</script>
