<template>
  <div
    :class="[
      'mobile-list-container',
      { 'mobile-list-container--dragover': isDragOverFiles }
    ]"
    role="main"
    :data-testid="`${props.dataTestid}-MobileList-Container`"
    @dragenter="handleDragEnter"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDropFiles"
  >
    <div :class="['mobile-list-container__content', props.transitionClass]">
      <div
        ref="sectionTrackRef"
        class="mobile-list-container__section-track"
        :style="sectionTrackBaseStyle"
        @transitionend="handleSectionTrackTransitionEnd"
      >
        <section
          ref="contentRef"
          :class="[
            'mobile-list-container__section mobile-list-container__section--chats',
            {
              'mobile-list-container__section--direct-hidden':
                isSectionHiddenDuringDirectTransition('chats')
            }
          ]"
          role="region"
          aria-label="Contact list"
          :aria-hidden="activeSection !== 'chats'"
          :data-testid="`${props.dataTestid}-ChatList-Section`"
          @scroll.passive="handleContentScroll"
        >
          <ChatFoldersPanel
            v-if="isManagingFolders && !isShareSelectionActive"
            mobile
            :topics="allTopics"
            :folders="chatFolders"
            :loading="isChatFoldersLoading"
            :selected-folder-id="activeFolderId"
            @close="closeFolderManager"
            @select-folder="handleSelectFolder"
            @select-topic="handleTopicSelect"
          >
            <template #folders>
              <ChatFolderRail
                mobile
                :loading="isChatFoldersLoading"
                :folders="chatFolders"
                :topics="chatBadgeTopics"
                :selected-folder-id="activeFolderId"
                is-managing
                is-active
                :auth-user-id="authUserId"
                @select="handleSelectFolder"
                @manage="closeFolderManager"
              />
            </template>
          </ChatFoldersPanel>

          <template v-else>
            <ChatsToolbar
              :model-value="toolbarState.search"
              :filter="toolbarState.selectedFilter"
              :filter-counts="filterCounts"
              :filter-muted-only="filterMutedOnly"
              class="mobile-list-container__toolbar"
              :data-testid="`${props.dataTestid}-MobileList`"
              @update:model-value="setSearch"
              @update:filter="setFilter"
              @create-chat="handleShowAccount(TopicType.DM)"
              @create-group="handleShowAccount(TopicType.Group)"
              @create-bot="handleShowBot"
              @manage-folders="openFolderManager"
            >
              <template v-if="!isShareSelectionActive" #folders>
                <ChatFolderRail
                  mobile
                  tabs
                  :loading="isChatFoldersLoading"
                  :folders="chatFolders"
                  :topics="chatBadgeTopics"
                  :selected-folder-id="activeFolderId"
                  :is-managing="false"
                  is-active
                  :auth-user-id="authUserId"
                  @select="handleSelectFolder"
                  @manage="openFolderManager"
                >
                  <template #filters>
                    <ChatsToolbarFilters
                      :model-value="toolbarState.selectedFilter"
                      :options="chatsToolbarFilterOptions"
                      :counts="filterCounts"
                      :muted-only="filterMutedOnly"
                      :data-testid="`${props.dataTestid}-MobileList-ChatsToolbar`"
                      @update:model-value="setFilter"
                    />
                  </template>
                </ChatFolderRail>
              </template>
            </ChatsToolbar>

            <div class="chat-list">
              <TopicList
                paginated
                :topics="contactList"
                :data-testid="`${props.dataTestid}-ContactList`"
                :selected-topic-id="selectedTopicId"
                :show-checkbox="isShareSelectionActive"
                :selected-topic-ids="selectedTopicIds"
                :search-query="toolbarState.search"
                :is-loading="isTopicsLoading || initialTopicListPending"
                :message-results="
                  isShareSelectionActive ? [] : filteredMessageSearchResults
                "
                :is-message-search-loading="
                  !isShareSelectionActive &&
                  (isMessageSearchPending || isMessageSearchLoading)
                "
                @unmount-topic="handleTopicSelect"
                @unmount-message="handleMessageSearchClick"
              />
            </div>
          </template>
        </section>

        <section
          :class="[
            'mobile-list-container__section mobile-list-container__section--calls',
            {
              'mobile-list-container__section--direct-hidden':
                isSectionHiddenDuringDirectTransition('calls')
            }
          ]"
          :aria-hidden="activeSection !== 'calls'"
        >
          <CallsPage
            v-if="mountedSections.has('calls')"
            :is-active="activeSection === 'calls'"
            :auto-select-first="false"
            :data-testid="`${props.dataTestid}-MobileList-CallsPage`"
          />
        </section>

        <section
          :class="[
            'mobile-list-container__section mobile-list-container__section--clients',
            {
              'mobile-list-container__section--direct-hidden':
                isSectionHiddenDuringDirectTransition('clients')
            }
          ]"
          :aria-hidden="activeSection !== 'clients'"
        >
          <ClientsPanel
            v-if="managerAllowed && mountedSections.has('clients')"
            is-mobile
          />
        </section>

        <section
          :class="[
            'mobile-list-container__section mobile-list-container__section--ai',
            {
              'mobile-list-container__section--direct-hidden':
                isSectionHiddenDuringDirectTransition('ai')
            }
          ]"
          :aria-hidden="activeSection !== 'ai'"
        >
          <AIMenuPanel v-if="chatAccess.ai && mountedSections.has('ai')" />
        </section>

        <section
          :class="[
            'mobile-list-container__section mobile-list-container__section--profile',
            {
              'mobile-list-container__section--direct-hidden':
                isSectionHiddenDuringDirectTransition('profile')
            }
          ]"
          :aria-hidden="activeSection !== 'profile'"
        >
          <MenuProfilePanel
            v-if="mountedSections.has('profile')"
            :is-active="activeSection === 'profile'"
            :data-testid="`${props.dataTestid}-MobileList-ProfilePanel`"
          />
        </section>
      </div>
    </div>
    <MenuUpdateButton :data-testid="`${props.dataTestid}-MobileList`" />
    <MenuBottomNav
      :is-collapse="false"
      :data-testid="`${props.dataTestid}-MobileList-BottomNav`"
    />
  </div>

  <IosPushNotificationPrompt
    v-if="isIosWeb() && !isShareSelectionActive"
    :active="
      activeSection === 'chats' && !selectedTopicId && !isManagingFolders
    "
  />

  <template v-if="!isAssistantRoute">
    <NewChatMobileModal
      v-if="hasOpenedNewChat"
      :open="state.showAddAccount"
      :is-add-one="state.newAccountTopicType === TopicType.DM"
      :selected-contact-ids="state.checkUsers"
      @unmount-close="handleCloseModal"
      @unmount-contact="handleNewContact"
    />
    <NewBotMobileModal
      v-if="hasOpenedNewBot"
      :open="state.showCreateBot"
      @unmount-close="handleCloseBotModal"
    />
  </template>
</template>

<script lang="ts">
let savedChatsScrollTop = 0;
</script>

<script setup lang="ts">
import { useChatAccess } from '../../composables/useChatAccess';
import {
  isClientTopic,
  useManagerInquiries
} from '../../composables/useManagerInquiries';
import ClientsPanel from '../Clients/ClientsPanel.vue';
import {
  reactive,
  computed,
  defineAsyncComponent,
  nextTick,
  ref,
  watch,
  onBeforeUnmount,
  onMounted
} from 'vue';
import type {
  IMobileListProps,
  IMobileListEmits
} from './interfaces/mobile-list';
import type { IUser } from '../interfaces/interfaces';
import TopicList from './TopicList.vue';
import ChatsToolbar from '../Menu/ChatsToolbar.vue';
import ChatsToolbarFilters from '../Menu/ChatsToolbarFilters.vue';
import { useTopics } from '../../composables/useTopics';
import { useUrlWatcher } from '../../composables/navigation';
import {
  navigateToDialogsList,
  navigateToGroupsList,
  RouteTypes
} from '../../composables/navigation/useUrlRouting';
import { TopicType } from '../../services/useChatSDK/types';
import {
  chatsToolbarFilterOptions,
  useChatsToolbarState
} from '../../composables/useChatsToolbarState';
import {
  type ChatMenuSection,
  useChatMenu
} from '../../composables/useChatMenu';
import MenuBottomNav from '../Menu/MenuBottomNav.vue';
import MenuUpdateButton from '../Menu/MenuUpdateButton.vue';
import { getAuthUser } from '../../composables/useAuth';
import { useShareSelection } from '../../composables/useShareSelection';
import type { ITopic } from '../interfaces/interfaces';
import { enqueuePendingShareFiles } from '../../services/useShareIntent';
import {
  navigateToSearchResult,
  searchMessages,
  type IMessageSearchResult
} from '../../composables/useMessageSearch';
import { getTopicsByChatsToolbarFilter } from '../../utils/chats-toolbar-filter';
import {
  getChatsToolbarFilterBadgeState,
  getChatsToolbarFilterCounts,
  getChatsToolbarFilterMutedOnly
} from '../../utils/chats-toolbar-filter-badge';
import {
  matchesTopicSearch,
  normalizeAtSearchQuery
} from '../../utils/searchMatch';
import { useChatFolders } from '../../composables/useChatFolders';
import ChatFoldersPanel from '../Menu/ChatFoldersPanel.vue';
import ChatFolderRail from '../Menu/ChatFolderRail.vue';
import { isIosWeb } from '../../utils/ios-pwa-viewport';
import IosPushNotificationPrompt from '../Menu/IosPushNotificationPrompt.vue';

const { access: chatAccess } = useChatAccess();

const NewChatMobileModal = defineAsyncComponent(
  () => import('../NewChat/NewChatMobileModal.vue')
);
const NewBotMobileModal = defineAsyncComponent(
  () => import('../NewChat/NewBotMobileModal.vue')
);
const CallsPage = defineAsyncComponent(() => import('../Calls/CallsPage.vue'));
const AIMenuPanel = defineAsyncComponent(() => import('../AI/AIMenuPanel.vue'));
const MenuProfilePanel = defineAsyncComponent(
  () => import('../Menu/MenuProfilePanel.vue')
);

const route = useUrlWatcher();

const isAssistantRoute = computed(
  () => route.value?.type === RouteTypes.ASSISTANT
);
const props = withDefaults(defineProps<IMobileListProps>(), {
  dataTestid: () => 'MobileList'
});

const {
  getTopicList,
  getUnreadTopicList,
  loadRemainingTopics,
  hasMoreTopics,
  initialTopicListPending,
  loading: isTopicsLoading
} = useTopics();
const { state: toolbarState, setSearch, setFilter } = useChatsToolbarState();
const { activeSection, animateSectionChange, setActiveSection } = useChatMenu();
const { allowed: managerAllowed } = useManagerInquiries();
const mountedSections = reactive(new Set<ChatMenuSection>(['chats']));
const { isShareSelectionActive, selectedTopicIds, toggleShareTopic } =
  useShareSelection();
const allTopics = computed(() =>
  initialTopicListPending.value
    ? []
    : getTopicList().filter(topic => !isClientTopic(topic))
);
const chatBadgeTopics = computed(() =>
  getUnreadTopicList().filter(topic => !isClientTopic(topic))
);
const messageSearchResults = ref<IMessageSearchResult[]>([]);
const isMessageSearchLoading = ref(false);
const isMessageSearchPending = ref(false);
const contentRef = ref<HTMLElement | null>(null);
const sectionTrackRef = ref<HTMLElement | null>(null);
const pendingSelectedTopicId = ref<string | undefined>();
let messageSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let messageSearchRequestToken = 0;
const authUserId = computed(() => getAuthUser()?.id || '');
const {
  folders: chatFolders,
  activeFolderId,
  activeFolder,
  isManagingFolders,
  isLoading: isChatFoldersLoading,
  loadFolders,
  selectFolder,
  openFolderManager,
  closeFolderManager
} = useChatFolders();
const dragEnterDepth = ref(0);
watch([activeFolderId, isManagingFolders, hasMoreTopics], () => {
  if (activeFolderId.value || isManagingFolders.value)
    void loadRemainingTopics();
});
const isDragOverFiles = ref(false);
const MENU_SECTION_ORDER: ChatMenuSection[] = [
  'chats',
  'calls',
  'clients',
  'ai',
  'profile'
];
const CHAT_SCROLL_RESTORE_MAX_FRAMES = 8;
let chatsScrollRestoreFrameId: number | null = null;
let chatsScrollRestoreAttempts = 0;
let pendingChatsScrollTop: number | null = null;
let isRestoringChatsScroll = false;
let directSectionTransitionTimeoutId: number | null = null;
const hiddenDirectTransitionSections = ref<Set<ChatMenuSection>>(new Set());

const filterBadgeState = computed(() =>
  getChatsToolbarFilterBadgeState(
    getUnreadTopicList().filter(topic => !isClientTopic(topic)),
    authUserId.value
  )
);

const filterCounts = computed(() =>
  getChatsToolbarFilterCounts(filterBadgeState.value)
);

const filterMutedOnly = computed(() =>
  getChatsToolbarFilterMutedOnly(filterBadgeState.value)
);

const hasOpenedNewChat = ref(false);
const hasOpenedNewBot = ref(false);
const state = reactive({
  showAddAccount: false,
  showCreateBot: false,
  newAccountTopicType: TopicType.DM,
  checkUsers: new Set<string | number>()
});

const matchesToolbarFilter = (topic?: ITopic | null): boolean => {
  if (!topic) {
    return false;
  }

  return (
    getTopicsByChatsToolbarFilter(
      [topic],
      toolbarState.filter,
      authUserId.value
    ).length > 0
  );
};

const matchesActiveFolder = (topic?: ITopic | null): boolean =>
  !!topic &&
  (!activeFolder.value || activeFolder.value.topicIds.includes(topic.id));

const contactList = computed(() => {
  const query = normalizeAtSearchQuery(toolbarState.search);
  const filteredByFolder = getTopicsByChatsToolbarFilter(
    allTopics.value,
    toolbarState.filter,
    authUserId.value
  ).filter(matchesActiveFolder);

  if (!query) {
    return [...filteredByFolder];
  }

  return filteredByFolder.filter(topic => matchesTopicSearch(topic, query));
});

const filteredMessageSearchResults = computed(() => {
  if (!normalizeAtSearchQuery(toolbarState.search)) {
    return [];
  }

  return messageSearchResults.value.filter(result => {
    const topic =
      result.topic || allTopics.value.find(t => t.id === result.topicId);

    return (
      matchesToolbarFilter(topic || null) && matchesActiveFolder(topic || null)
    );
  });
});

const selectedTopicId = computed(
  () => pendingSelectedTopicId.value || route.value.id || undefined
);
const activeSectionIndex = computed(() =>
  Math.max(0, MENU_SECTION_ORDER.indexOf(activeSection.value))
);
const sectionTrackBaseStyle = computed(() => ({
  '--mobile-menu-section-offset': `${activeSectionIndex.value * -100}%`,
  transition: animateSectionChange.value ? undefined : 'none'
}));

const emits = defineEmits<IMobileListEmits>();

const applySectionTrackOffset = (): void => {
  if (!sectionTrackRef.value) {
    return;
  }

  sectionTrackRef.value.style.setProperty(
    '--mobile-menu-section-offset',
    `${activeSectionIndex.value * -100}%`
  );
};

const clearDirectSectionTransitionState = (): void => {
  if (directSectionTransitionTimeoutId !== null) {
    window.clearTimeout(directSectionTransitionTimeoutId);
    directSectionTransitionTimeoutId = null;
  }

  hiddenDirectTransitionSections.value = new Set();
};

const isSectionHiddenDuringDirectTransition = (
  section: ChatMenuSection
): boolean => hiddenDirectTransitionSections.value.has(section);

const hideIntermediateSectionsForDirectTransition = (
  fromSection?: ChatMenuSection,
  toSection?: ChatMenuSection
): void => {
  clearDirectSectionTransitionState();

  if (!fromSection || !toSection || fromSection === toSection) {
    return;
  }

  const fromIndex = MENU_SECTION_ORDER.indexOf(fromSection);
  const toIndex = MENU_SECTION_ORDER.indexOf(toSection);

  if (fromIndex < 0 || toIndex < 0 || Math.abs(toIndex - fromIndex) <= 1) {
    return;
  }

  const [startIndex, endIndex] =
    fromIndex < toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
  hiddenDirectTransitionSections.value = new Set(
    MENU_SECTION_ORDER.slice(startIndex + 1, endIndex)
  );

  directSectionTransitionTimeoutId = window.setTimeout(() => {
    clearDirectSectionTransitionState();
  }, 320);
};

const handleSectionTrackTransitionEnd = (event: TransitionEvent): void => {
  if (
    event.target !== sectionTrackRef.value ||
    event.propertyName !== 'transform'
  ) {
    return;
  }

  clearDirectSectionTransitionState();
};

const saveChatsScrollPosition = (): void => {
  if (activeSection.value !== 'chats' || !contentRef.value) {
    return;
  }

  if (isRestoringChatsScroll) {
    return;
  }

  savedChatsScrollTop = contentRef.value.scrollTop;
};

const clearChatsScrollRestoreSchedule = (): void => {
  if (chatsScrollRestoreFrameId !== null) {
    window.cancelAnimationFrame(chatsScrollRestoreFrameId);
    chatsScrollRestoreFrameId = null;
  }
};

const finishChatsScrollRestore = (): void => {
  clearChatsScrollRestoreSchedule();
  isRestoringChatsScroll = false;
  pendingChatsScrollTop = null;
  chatsScrollRestoreAttempts = 0;
};

const applyChatsScrollRestore = (): boolean => {
  const element = contentRef.value;
  const targetTop = pendingChatsScrollTop ?? savedChatsScrollTop;

  if (activeSection.value !== 'chats' || !element) {
    return true;
  }

  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
  const nextScrollTop = Math.min(targetTop, maxScrollTop);

  if (Math.abs(element.scrollTop - nextScrollTop) > 1) {
    element.scrollTop = nextScrollTop;
  }

  return targetTop <= 0 || Math.abs(element.scrollTop - targetTop) <= 1;
};

const scheduleChatsScrollRestorePass = (): void => {
  if (chatsScrollRestoreFrameId !== null) {
    return;
  }

  chatsScrollRestoreFrameId = window.requestAnimationFrame(() => {
    chatsScrollRestoreFrameId = null;

    if (!isRestoringChatsScroll) {
      return;
    }

    chatsScrollRestoreAttempts += 1;

    if (
      applyChatsScrollRestore() ||
      chatsScrollRestoreAttempts >= CHAT_SCROLL_RESTORE_MAX_FRAMES
    ) {
      finishChatsScrollRestore();
      return;
    }

    scheduleChatsScrollRestorePass();
  });
};

const restoreChatsScrollPosition = (): void => {
  if (activeSection.value !== 'chats') {
    return;
  }

  pendingChatsScrollTop = savedChatsScrollTop;
  isRestoringChatsScroll = true;
  chatsScrollRestoreAttempts = 0;
  clearChatsScrollRestoreSchedule();

  if (applyChatsScrollRestore()) {
    finishChatsScrollRestore();
    return;
  }

  void nextTick(() => {
    if (!isRestoringChatsScroll) {
      return;
    }

    if (applyChatsScrollRestore()) {
      finishChatsScrollRestore();
      return;
    }

    scheduleChatsScrollRestorePass();
  });
};

const handleContentScroll = (): void => {
  saveChatsScrollPosition();
};

const handleTopicSelect = (topic: ITopic): void => {
  saveChatsScrollPosition();
  pendingSelectedTopicId.value = topic.id;

  if (isShareSelectionActive.value) {
    toggleShareTopic(topic.id);
  }
};

const runMessageSearch = async (
  query: string,
  requestToken: number
): Promise<void> => {
  if (!query || isShareSelectionActive.value) {
    messageSearchResults.value = [];
    isMessageSearchLoading.value = false;
    isMessageSearchPending.value = false;
    return;
  }

  isMessageSearchLoading.value = true;

  const { results } = await searchMessages(query, {
    limit: 50,
    onLocalResults: ({ results: localResults }) => {
      if (requestToken === messageSearchRequestToken)
        messageSearchResults.value = localResults;
    }
  });

  if (requestToken !== messageSearchRequestToken) {
    return;
  }

  messageSearchResults.value = results;
  isMessageSearchLoading.value = false;
  isMessageSearchPending.value = false;
};

const handleMessageSearchClick = (result: IMessageSearchResult): void => {
  setActiveSection('chats');
  navigateToSearchResult(result);
};

const handleSelectFolder = (folderId: string | null): void => {
  selectFolder(folderId);
  setSearch('');
  void restoreChatsScrollPosition();
};

const handleShowAccount = (topicType: TopicType) => {
  hasOpenedNewChat.value = true;
  if (isAssistantRoute.value) {
    return;
  }

  setActiveSection('chats');
  state.showCreateBot = false;
  state.newAccountTopicType = topicType;
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

const handleCloseBotModal = () => {
  state.showCreateBot = false;
};

const handleNewContact = (contact: IUser): void => {
  emits('unmount-contact', contact);
  handleCloseModal();
};

const handleShowBot = () => {
  hasOpenedNewBot.value = true;
  if (isAssistantRoute.value) {
    return;
  }

  setActiveSection('chats');
  state.showAddAccount = false;
  state.showCreateBot = true;
  navigateToDialogsList();
};

const hasDraggedFiles = (event: DragEvent): boolean => {
  if (event.dataTransfer?.files?.length) {
    return true;
  }

  return Array.from(event.dataTransfer?.items || []).some(
    item => item.kind === 'file'
  );
};

const resetDragState = (): void => {
  dragEnterDepth.value = 0;
  isDragOverFiles.value = false;
};

const handleDragEnter = (event: DragEvent): void => {
  if (activeSection.value !== 'chats' || !hasDraggedFiles(event)) {
    return;
  }

  event.preventDefault();
  dragEnterDepth.value += 1;
  isDragOverFiles.value = true;
};

const handleDragOver = (event: DragEvent): void => {
  if (activeSection.value !== 'chats' || !hasDraggedFiles(event)) {
    return;
  }

  event.preventDefault();

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy';
  }
};

const handleDragLeave = (event: DragEvent): void => {
  if (activeSection.value !== 'chats' || !isDragOverFiles.value) {
    return;
  }

  event.preventDefault();
  dragEnterDepth.value = Math.max(0, dragEnterDepth.value - 1);

  if (dragEnterDepth.value === 0) {
    isDragOverFiles.value = false;
  }
};

const handleDropFiles = async (event: DragEvent): Promise<void> => {
  if (activeSection.value !== 'chats' || !hasDraggedFiles(event)) {
    resetDragState();
    return;
  }

  event.preventDefault();

  const files = Array.from(event.dataTransfer?.files || []);
  resetDragState();

  if (!files.length) {
    return;
  }

  await enqueuePendingShareFiles(files);
};

watch(
  [() => toolbarState.search, isShareSelectionActive, authUserId],
  () => {
    const query = normalizeAtSearchQuery(toolbarState.search);
    const requestToken = ++messageSearchRequestToken;

    if (messageSearchDebounceTimer) {
      clearTimeout(messageSearchDebounceTimer);
      messageSearchDebounceTimer = null;
    }

    messageSearchResults.value = [];

    if (!query || isShareSelectionActive.value) {
      isMessageSearchPending.value = false;
      isMessageSearchLoading.value = false;
      return;
    }

    isMessageSearchPending.value = true;
    messageSearchDebounceTimer = setTimeout(() => {
      void runMessageSearch(query, requestToken);
    }, 300);
  },
  { immediate: true }
);

watch(
  [isTopicsLoading, authUserId],
  ([loading, userId]) => {
    if (!loading && userId) void loadFolders();
  },
  { immediate: true }
);

watch(
  () => activeSection.value,
  (section, previousSection) => {
    mountedSections.add(section);
    if (animateSectionChange.value) {
      hideIntermediateSectionsForDirectTransition(previousSection, section);
    } else {
      clearDirectSectionTransitionState();
    }
    applySectionTrackOffset();

    if (previousSection === 'chats') {
      saveChatsScrollPosition();
    }

    if (section === 'chats') {
      void restoreChatsScrollPosition();
    }
  },
  { immediate: true }
);

watch(activeSectionIndex, applySectionTrackOffset);

watch(
  () => contactList.value.length,
  () => {
    void restoreChatsScrollPosition();
  }
);

onMounted(() => {
  applySectionTrackOffset();
  void restoreChatsScrollPosition();
  void loadFolders();
});

onBeforeUnmount(() => {
  messageSearchRequestToken++;
  saveChatsScrollPosition();
  finishChatsScrollRestore();
  clearDirectSectionTransitionState();

  if (messageSearchDebounceTimer) {
    clearTimeout(messageSearchDebounceTimer);
    messageSearchDebounceTimer = null;
  }
});
</script>
