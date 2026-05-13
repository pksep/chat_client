<template>
  <aside
    :class="menuClasses"
    :data-testid="`${props.dataTestid}-Menu-Container`"
  >
    <Icon
      :name="isCollapse ? IconNameEnum.chevronRight : IconNameEnum.chevronLeft"
      class="chats-toolbar__collapse"
      @click="handleCollapse"
      :data-testid="`${props.dataTestid}-Menu-ChatsToolbar-CollapseIcon`"
    />

    <div
      class="menu__start"
      :data-testid="`${props.dataTestid}-Menu-StartContainer`"
    >
      <template v-if="activeSection === 'chats'">
        <ChatsToolbar
          :model-value="toolbarState.search"
          :filter="toolbarState.filter"
          :filter-counts="filterCounts"
          :is-collapse="isCollapse"
          :data-testid="`${props.dataTestid}-Menu`"
          @update:model-value="setSearch"
          @update:filter="setFilter"
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
      </template>

      <MenuCallsPanel
        v-else-if="activeSection === 'calls'"
        :data-testid="`${props.dataTestid}-Menu-CallsPanel`"
      />

      <MenuProfilePanel
        v-else
        :data-testid="`${props.dataTestid}-Menu-ProfilePanel`"
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

    <MenuBottomNav
      :is-collapse="isCollapse"
      :data-testid="`${props.dataTestid}-Menu-BottomNav`"
    />
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
import { useChatMenu } from '../composables/useChatMenu';
import MenuBottomNav from './Menu/MenuBottomNav.vue';
import MenuCallsPanel from './Menu/MenuCallsPanel.vue';
import MenuProfilePanel from './Menu/MenuProfilePanel.vue';
import { getAuthUser } from '../composables/useAuth';
import { getTopicUnreadBadgeCount } from '../utils/topicUnreadBadge';

const props = withDefaults(defineProps<IMenuProps>(), {
  dataTestid: 'Menu'
});

const { getTopicList } = useTopics();
const route = useUrlWatcher();
const { canInstall, handleInstall, isInstalled } = usePwaInstall();
const selectedContactId = computed(() => route.value?.id);
const { state: toolbarState, setSearch, setFilter } = useChatsToolbarState();
const { activeSection, setActiveSection } = useChatMenu();
const allTopics = computed(() => getTopicList());
const authUserId = computed(() => getAuthUser()?.id || '');

const filterCounts = computed(() => ({
  all: allTopics.value.reduce(
    (sum, topic) => sum + getTopicUnreadBadgeCount(topic, authUserId.value),
    0
  ),
  chats: allTopics.value
    .filter(topic => topic.type === TopicType.DM)
    .reduce(
      (sum, topic) => sum + getTopicUnreadBadgeCount(topic, authUserId.value),
      0
    ),
  groups: allTopics.value
    .filter(topic => topic.type === TopicType.Group)
    .reduce(
      (sum, topic) => sum + getTopicUnreadBadgeCount(topic, authUserId.value),
      0
    )
}));

const topicGroups = computed(() => {
  const query = toolbarState.search.toLowerCase().trim();

  const filteredByType = allTopics.value.filter(topic => {
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
  if (!isCollapse.value) {
    setActiveSection('chats');
  }

  toggle();
};

const unmountTopicClick = (topic: ITopic): void => {
  setActiveSection('chats');

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
