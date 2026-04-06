<template>
  <aside
    :class="menuClasses"
    :data-testid="`${props.dataTestid}-Menu-Container`"
  >
    <div
      class="menu__start"
      :data-testid="`${props.dataTestid}-Menu-StartContainer`"
    >
      <ChatsToolbar
        :model-value="toolbarState.search"
        :filter="toolbarState.filter"
        :is-collapse="isCollapse"
        :show-collapse="true"
        :data-testid="`${props.dataTestid}-Menu`"
        @update:model-value="setSearch"
        @update:filter="setFilter"
        @collapse="handleCollapse"
        @create-chat="handleNewContactModal"
        @create-group="handleNewGroupModal"
      />

      <TopicList
        class="menu__contact-list"
        :topics="topicGroups"
        @unmount-topic="unmountTopicClick"
        :selected-topic-id="selectedContactId"
        :data-testid="`${props.dataTestid}-Menu-ContactList`"
      />
    </div>

    <Button
      v-if="canInstall && !isInstalled"
      class="menu__button-install-prompt"
      :type="ButtonTypeEnum.ghost"
      :size="SizesEnum.small"
      @click="handleInstall"
      :data-testid="`${props.dataTestid}-Menu-InstallButton`"
    >
      <Icon
        :name="IconNameEnum.uploadCloud"
        :data-testid="`${props.dataTestid}-Menu-InstallIcon`"
      />
      <template v-if="!isCollapse"> Загрузить на устройство </template>
    </Button>
  </aside>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useResizeState } from '../composables/useResizeState';
import { MAX_W_MD } from '../utils/constants';
import {
  Icon,
  Button,
  ButtonTypeEnum,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';
import type { ITopic, IMenuEmits, IMenuProps } from './interfaces/interfaces';
import { usePwaInstall } from '../composables/usePwaInstall';
import {
  navigateToGroup,
  navigateToDialogs,
  useUrlWatcher
} from '../composables/navigation';
import { useTopics } from '../composables/useTopics';
import TopicList from './ContactList/TopicList.vue';
import ChatsToolbar from './Menu/ChatsToolbar.vue';
import { TopicType } from '../services/useChatSDK/types';
import { useChatsToolbarState } from '../composables/useChatsToolbarState';

const props = withDefaults(defineProps<IMenuProps>(), {
  dataTestid: 'Menu'
});

const { getTopicList } = useTopics();
const route = useUrlWatcher();
const { canInstall, handleInstall, isInstalled } = usePwaInstall();
const selectedContactId = computed(() => route.value?.id);
const { state: toolbarState, setSearch, setFilter } = useChatsToolbarState();

const topicGroups = computed(() => {
  const allTopics = getTopicList();
  const query = toolbarState.search.toLowerCase().trim();

  const filteredByType = allTopics.filter(topic => {
    if (toolbarState.filter === 'chats') {
      return topic.type === TopicType.DM;
    }

    if (toolbarState.filter === 'groups') {
      return topic.type === TopicType.Group;
    }

    return true;
  });

  if (!query) {
    return filteredByType;
  }

  return filteredByType.filter(topic => {
    const nameMatch = (topic.name || '').toLowerCase().includes(query);
    const erpInitialsMatch = (
      typeof topic.user?.ex === 'string'
        ? JSON.parse(topic.user.ex)
        : topic.user?.ex
    )?.erpInitials
      ?.toLowerCase()
      ?.includes(query);

    return nameMatch || erpInitialsMatch;
  });
});

const emits = defineEmits<IMenuEmits>();

const { state: isCollapse, toggle } = useResizeState({
  breakpoint: MAX_W_MD,
  storageKey: 'menu-collapse',
  onStateChange: val => {
    emits('unmount-collapse', val);
  }
});

const handleCollapse = (): void => {
  toggle();
};

const unmountTopicClick = (topic: ITopic): void => {
  if (topic.type === 'GROUP') {
    navigateToGroup(topic.id);
  } else if (topic.type === 'DM') {
    navigateToDialogs(topic.id);
  }
};

const menuClasses = computed(() => [
  'menu',
  { 'menu--collapse': isCollapse.value },
  props.class
]);

const handleNewGroupModal = () => {
  emits('unmount-new-group', { isChapterOpen: true });
};

const handleNewContactModal = () => {
  emits('unmount-new-contact', { isChapterOpen: true });
};
</script>
