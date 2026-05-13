<template>
  <div
    class="mobile-list-container"
    role="main"
    :data-testid="`${props.dataTestid}-MobileList-Container`"
  >
    <div class="mobile-list-container__content">
      <template v-if="activeSection === 'chats'">
        <ChatsToolbar
          :model-value="toolbarState.search"
          :filter="toolbarState.filter"
          :filter-counts="filterCounts"
          class="mobile-list-container__toolbar"
          :data-testid="`${props.dataTestid}-MobileList`"
          @update:model-value="setSearch"
          @update:filter="setFilter"
          @create-chat="handleShowAccount(TopicType.DM)"
          @create-group="handleShowAccount(TopicType.Group)"
        />

        <section
          class="chat-list"
          role="region"
          aria-label="Contact list"
          :data-testid="`${props.dataTestid}-ChatList-Section`"
        >
          <TopicList
            :topics="contactList"
            :data-testid="`${props.dataTestid}-ContactList`"
            @unmount-contact="handleContactSelect"
          />
        </section>
      </template>

      <MenuCallsPanel
        v-else-if="activeSection === 'calls'"
        :data-testid="`${props.dataTestid}-MobileList-CallsPanel`"
      />

      <MenuProfilePanel
        v-else
        :data-testid="`${props.dataTestid}-MobileList-ProfilePanel`"
      />
    </div>

    <MenuBottomNav
      :is-collapse="false"
      :data-testid="`${props.dataTestid}-MobileList-BottomNav`"
    />
  </div>

  <template v-if="!isAssistantRoute">
    <NewChatMobileModal
      :open="state.showAddAccount"
      :contacts="[]"
      :is-add-one="!isGroupRoute"
      :selected-contact-ids="state.checkUsers"
      @unmount-close="handleCloseModal"
      @unmount-contact="handleNewContact"
    />
  </template>
</template>

<script setup lang="ts">
import { reactive, computed } from 'vue';
import type {
  IMobileListProps,
  IMobileListEmits
} from './interfaces/mobile-list';
import type { IUser } from '../interfaces/interfaces';
import NewChatMobileModal from '../NewChat/NewChatMobileModal.vue';
import TopicList from './TopicList.vue';
import ChatsToolbar from '../Menu/ChatsToolbar.vue';
import { useTopics } from '../../composables/useTopics';
import { useUrlWatcher } from '../../composables/navigation';
import {
  navigateToDialogsList,
  navigateToGroupsList,
  RouteTypes
} from '../../composables/navigation/useUrlRouting';
import { TopicType } from '../../services/useChatSDK/types';
import { useChatsToolbarState } from '../../composables/useChatsToolbarState';
import { useChatMenu } from '../../composables/useChatMenu';
import MenuBottomNav from '../Menu/MenuBottomNav.vue';
import MenuCallsPanel from '../Menu/MenuCallsPanel.vue';
import MenuProfilePanel from '../Menu/MenuProfilePanel.vue';
import { getAuthUser } from '../../composables/useAuth';
import { getTopicUnreadBadgeCount } from '../../utils/topicUnreadBadge';

const route = useUrlWatcher();

const isAssistantRoute = computed(
  () => route.value?.type === RouteTypes.ASSISTANT
);
const isGroupRoute = computed(() => route.value?.type === RouteTypes.GROUP);

const props = withDefaults(defineProps<IMobileListProps>(), {
  dataTestid: () => 'MobileList'
});

const { getTopicList } = useTopics();
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

const state = reactive({
  showAddAccount: false,
  checkUsers: new Set<string | number>()
});

const contactList = computed(() => {
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
    return [...filteredByType];
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

const emits = defineEmits<IMobileListEmits>();

const handleContactSelect = (): void => {};

const handleShowAccount = (topicType: TopicType) => {
  if (isAssistantRoute.value) {
    return;
  }

  setActiveSection('chats');
  state.showAddAccount = true;

  if (topicType === TopicType.DM) {
    navigateToDialogsList();
  } else if (topicType === TopicType.Group) {
    navigateToGroupsList();
  }
};

const handleCloseModal = () => {
  state.showAddAccount = false;
  state.checkUsers.clear();
};

const handleNewContact = (contact: IUser): void => {
  emits('unmount-contact', contact);
  handleCloseModal();
};
</script>
