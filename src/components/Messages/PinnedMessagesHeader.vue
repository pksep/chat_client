<template>
  <div class="pinned-list-header" data-testid="PinnedList-Header">
    <button
      class="pinned-list-header__back"
      aria-label="Назад в переписку"
      @click="closePinnedMessagesView"
    >
      <Icon :name="IconNameEnum.arrowLeft" />
    </button>
    <div class="pinned-list-header__identity">
      <h3>{{ title }}</h3>
      <p>{{ countLabel }}</p>
    </div>
    <button
      v-if="!isMobile"
      aria-label="Поиск в переписке"
      @click="emit('search')"
    >
      <SearchIcon />
    </button>
    <button v-if="canCall" aria-label="Позвонить" @click="emit('call')">
      <CallIcon />
    </button>
    <div class="pinned-list-header__menu-wrap">
      <button
        aria-label="Меню закреплений"
        :aria-expanded="menu"
        @click="menu = !menu"
      >
        <Icon :name="IconNameEnum.moreHorizontal" />
      </button>
      <div v-if="menu" class="pin-note__menu" role="menu">
        <button
          role="menuitem"
          @click="
            menu = false;
            refresh();
          "
        >
          Обновить закрепления
        </button>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon, IconNameEnum } from '@pksep/yui';
import { closePinnedMessagesView } from '../../services/pinned-messages-view';
import { getSelectedTopic } from '../../composables/useTopics';
import {
  getPinnedMessagesByTopicId,
  fetchPinnedMessagesForTopic
} from '../../services/useMessages';
import { usePinComments } from '../../services/usePinComments';
import CallIcon from '../CallModal/UI/CallIcon.vue';
import SearchIcon from '../UI/SearchIcon.vue';
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';
const props = defineProps<{ topicId: string; canCall?: boolean }>();
const emit = defineEmits<{ search: []; call: [] }>();
const menu = ref(false);
const { state: isMobile } = useResizeState(MAX_W_MD);
const { state, pinComments } = usePinComments(() => props.topicId);
const title = computed(() => {
  const topic = getSelectedTopic(props.topicId);
  return topic?.name || topic?.user?.initials || 'Закреплённые сообщения';
});
const countLabel = computed(() => {
  void state.value;
  const count = pinComments.projectPins(
    props.topicId,
    getPinnedMessagesByTopicId(props.topicId)
  ).length;
  const word =
    count % 100 >= 11 && count % 100 <= 14
      ? 'закреплённых сообщений'
      : count % 10 === 1
        ? 'закреплённое сообщение'
        : count % 10 >= 2 && count % 10 <= 4
          ? 'закреплённых сообщения'
          : 'закреплённых сообщений';
  return `${count} ${word}`;
});
const refresh = () => {
  void fetchPinnedMessagesForTopic(props.topicId);
  void pinComments.refresh(props.topicId);
};
</script>
