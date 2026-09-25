import { computed, ref } from 'vue';
import { useChatsToolbarState } from './useChatsToolbarState';
import { useChatMenu } from './useChatMenu';
import { navigateToDefault } from './navigation/useUrlRouting';
import type { ITopic } from '../components/interfaces/interfaces';
import {
  clearPendingShareBatches,
  usePendingShareIntent
} from '../services/useShareIntent';
import { showErrorNotification } from './useNotifications';
import { stripHtml } from '../utils/stripHtml';

const isShareSelectionActive = ref(false);
const isSendingSharedFiles = ref(false);
const shareMessage = ref('');
const selectedTopicIds = ref<Set<string>>(new Set());

const normalizeShareMessage = (value?: string | null): string => {
  if (!value) {
    return '';
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return '';
  }

  return stripHtml(normalizedValue).length > 0 ? normalizedValue : '';
};

export const useShareSelection = () => {
  const { pendingShareBatches, hasPendingShareBatches } =
    usePendingShareIntent();
  const { setActiveSection } = useChatMenu();
  const { setSearch, setFilter } = useChatsToolbarState();

  const resetShareSelectionState = (): void => {
    shareMessage.value = '';
    selectedTopicIds.value = new Set<string>();
    setSearch('');
  };

  const pendingShareFilesCount = computed(() =>
    pendingShareBatches.value.reduce(
      (total, batch) => total + batch.files.length,
      0
    )
  );
  const pendingShareBatchCount = computed(
    () => pendingShareBatches.value.length
  );
  const selectedTopicsCount = computed(() => selectedTopicIds.value.size);
  const shareIntentDefaultMessage = computed(
    () => pendingShareBatches.value[0]?.text || ''
  );

  const startShareSelection = (): void => {
    if (!hasPendingShareBatches.value || isShareSelectionActive.value) {
      return;
    }

    isShareSelectionActive.value = true;
    isSendingSharedFiles.value = false;
    shareMessage.value = shareIntentDefaultMessage.value;
    selectedTopicIds.value = new Set<string>();
    setActiveSection('chats');
    setFilter('all');
    navigateToDefault();
  };

  const closeShareSelection = (): void => {
    if (isSendingSharedFiles.value) {
      return;
    }

    isShareSelectionActive.value = false;
    clearPendingShareBatches();
    resetShareSelectionState();
  };

  const completeShareSelection = (): void => {
    isShareSelectionActive.value = false;
    clearPendingShareBatches();
    resetShareSelectionState();
  };

  const toggleShareTopic = (topicId: string): void => {
    const nextIds = new Set(selectedTopicIds.value);

    if (nextIds.has(topicId)) {
      nextIds.delete(topicId);
    } else {
      nextIds.add(topicId);
    }

    selectedTopicIds.value = nextIds;
  };

  const setShareTopicSelected = (
    topicId: string,
    isSelected: boolean
  ): void => {
    const nextIds = new Set(selectedTopicIds.value);

    if (isSelected) {
      nextIds.add(topicId);
    } else {
      nextIds.delete(topicId);
    }

    selectedTopicIds.value = nextIds;
  };

  const updateShareMessage = (value: string): void => {
    shareMessage.value = normalizeShareMessage(value);
  };

  const sendSharedFiles = async (
    topics: ITopic[],
    options?: {
      extraFiles?: File[];
    }
  ): Promise<void> => {
    if (topics.length === 0 || isSendingSharedFiles.value) {
      return;
    }

    isSendingSharedFiles.value = true;

    const batches = [...pendingShareBatches.value];
    const extraFiles = options?.extraFiles?.filter(Boolean) || [];
    const message = normalizeShareMessage(shareMessage.value);
    const allFiles = [...batches.flatMap(batch => batch.files), ...extraFiles];
    const fallbackMessage =
      normalizeShareMessage(
        batches.find(batch => normalizeShareMessage(batch.text))?.text || ''
      ) || '';

    if (allFiles.length === 0) {
      isSendingSharedFiles.value = false;
      return;
    }

    completeShareSelection();
    isSendingSharedFiles.value = false;

    const sender = import('../services/useSharedFilesSender');
    const sendTasks = topics.map(topic =>
      sender.then(({ sendSharedFilesToTopic }) =>
        sendSharedFilesToTopic(topic.id, allFiles, message || fallbackMessage)
      )
    );

    void Promise.allSettled(sendTasks).then(results => {
      const failedResults = results.filter(
        result => result.status === 'rejected'
      );

      if (failedResults.length > 0) {
        const [firstFailedResult] = failedResults;
        const errorMessage =
          firstFailedResult.status === 'rejected'
            ? firstFailedResult.reason?.message
            : '';

        console.error('Failed to send shared files:', failedResults);
        showErrorNotification(errorMessage || 'Не удалось отправить вложения');
        return;
      }
    });
  };

  return {
    pendingShareBatches,
    hasPendingShareBatches,
    pendingShareFilesCount,
    pendingShareBatchCount,
    shareIntentDefaultMessage,
    isShareSelectionActive,
    isSendingSharedFiles,
    shareMessage,
    selectedTopicIds,
    selectedTopicsCount,
    startShareSelection,
    closeShareSelection,
    toggleShareTopic,
    setShareTopicSelected,
    updateShareMessage,
    sendSharedFiles
  };
};
