<template>
  <ShareSelectionModal
    v-if="isShareSelectionActive"
    :open="isShareSelectionActive"
    :topics="contactList"
    :message="shareMessage"
    :search="toolbarState.search"
    :filter="toolbarState.filter"
    :filter-counts="filterCounts"
    :filter-muted-only="filterMutedOnly"
    :selected-topic-ids="selectedTopicIds"
    :selected-count="selectedTopicsCount"
    :files-count="shareModalFilesCount"
    :summary-label="shareModalSummaryLabel"
    :is-sending="isSendingSharedFiles"
    data-testid="ShareSelectionOverlay"
    @update:message="updateShareMessage"
    @update:search="setSearch"
    @update:filter="setFilter"
    @toggle-topic="handleTopicSelect"
    @attach-files="handleShareAttachFiles"
    @cancel="handleCloseShareSelection"
    @submit-input="handleShareInputSubmit"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import ShareSelectionModal from './Menu/ShareSelectionModal.vue';
import { useTopics } from '../composables/useTopics';
import { useChatsToolbarState } from '../composables/useChatsToolbarState';
import { TopicType } from '../services/useChatSDK/types';
import { getAuthUser } from '../composables/useAuth';
import { useShareSelection } from '../composables/useShareSelection';
import type { ITopic } from './interfaces/interfaces';
import { getShareSelectionSummaryLabel } from '../utils/shareSelectionSummary';
import { isBotTopic } from '../utils/bot';
import {
  getChatsToolbarFilterBadgeState,
  getChatsToolbarFilterCounts,
  getChatsToolbarFilterMutedOnly
} from '../utils/chats-toolbar-filter-badge';

const { getTopicList } = useTopics();
const { state: toolbarState, setSearch, setFilter } = useChatsToolbarState();
const {
  pendingShareBatches,
  isShareSelectionActive,
  isSendingSharedFiles,
  shareMessage,
  selectedTopicIds,
  selectedTopicsCount,
  closeShareSelection,
  toggleShareTopic,
  updateShareMessage,
  sendSharedFiles
} = useShareSelection();

const allTopics = computed(() => getTopicList());
const authUserId = computed(() => getAuthUser()?.id || '');
const draftShareFiles = ref<File[]>([]);

const buildFileFingerprint = (file: File): string =>
  `${file.name}:${file.size}:${file.lastModified}:${file.type}`;

const appendDraftShareFiles = (files: File[] | FileList): void => {
  const nextFiles = Array.isArray(files) ? files : Array.from(files);

  if (!nextFiles.length) {
    return;
  }

  const existingFingerprints = new Set(
    draftShareFiles.value.map(buildFileFingerprint)
  );
  const uniqueFiles = nextFiles.filter(file => {
    const fingerprint = buildFileFingerprint(file);

    if (existingFingerprints.has(fingerprint)) {
      return false;
    }

    existingFingerprints.add(fingerprint);
    return true;
  });

  if (!uniqueFiles.length) {
    return;
  }

  draftShareFiles.value = [...draftShareFiles.value, ...uniqueFiles];
};

const resetDraftShareFiles = (): void => {
  draftShareFiles.value = [];
};

const shareModalFilesCount = computed(
  () =>
    pendingShareBatches.value.reduce(
      (total, batch) => total + batch.files.length,
      0
    ) + draftShareFiles.value.length
);
const shareModalSummaryLabel = computed(() =>
  getShareSelectionSummaryLabel([
    ...pendingShareBatches.value.flatMap(batch => batch.files),
    ...draftShareFiles.value
  ])
);

const matchesToolbarFilter = (topic?: ITopic | null): boolean => {
  if (!topic) {
    return false;
  }

  if (toolbarState.filter === 'chats') {
    return topic.type === TopicType.DM && !isBotTopic(topic);
  }

  if (toolbarState.filter === 'groups') {
    return topic.type === TopicType.Group;
  }

  if (toolbarState.filter === 'bots') {
    return isBotTopic(topic);
  }

  return true;
};

const filterBadgeState = computed(() =>
  getChatsToolbarFilterBadgeState(allTopics.value, authUserId.value)
);

const filterCounts = computed(() =>
  getChatsToolbarFilterCounts(filterBadgeState.value)
);

const filterMutedOnly = computed(() =>
  getChatsToolbarFilterMutedOnly(filterBadgeState.value)
);

const contactList = computed(() => {
  const query = toolbarState.search.toLowerCase().trim();
  const filteredByType = allTopics.value.filter(topic =>
    matchesToolbarFilter(topic)
  );

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

const handleTopicSelect = (topic: ITopic): void => {
  toggleShareTopic(topic.id);
};

const handleSendSharedFiles = async (): Promise<void> => {
  const selectedTopics = allTopics.value.filter(topic =>
    selectedTopicIds.value.has(topic.id)
  );

  if (!selectedTopics.length) {
    return;
  }

  const extraFiles = [...draftShareFiles.value];
  resetDraftShareFiles();
  await sendSharedFiles(selectedTopics, { extraFiles });
};

const handleShareInputSubmit = async (payload?: {
  content?: string;
  files?: FileList;
  mediaFiles?: FileList;
}): Promise<void> => {
  if (typeof payload?.content === 'string') {
    updateShareMessage(payload.content);
  }

  if (payload?.files) {
    appendDraftShareFiles(payload.files);
  }

  if (payload?.mediaFiles) {
    appendDraftShareFiles(payload.mediaFiles);
  }

  await handleSendSharedFiles();
};

const handleShareAttachFiles = (files: FileList): void => {
  appendDraftShareFiles(files);
};

const handleCloseShareSelection = (): void => {
  resetDraftShareFiles();
  closeShareSelection();
};
</script>
