import { ref } from 'vue';
import type { ITopic } from '../components/interfaces/interfaces';
import { TopicType } from '../services/useChatSDK/types';
import { navigateToDialogs, navigateToGroup } from './navigation/useUrlRouting';
import {
  aiConversationSourceSchema,
  type AiConversationSource
} from '../services/aiConversationSource';

const aiSources = new Map<
  string,
  { text: string; source: AiConversationSource }
>();

export function takeAiForwardSource(
  topicId: string,
  text: string
): AiConversationSource | null {
  const draft = aiSources.get(topicId);
  aiSources.delete(topicId);
  if (
    !draft ||
    !text.replace(/\s+/g, ' ').includes(draft.text.replace(/\s+/g, ' '))
  )
    return null;

  return draft.source;
}

const pendingDraftTopicId = ref<string | null>(null);
const pendingDraftText = ref('');

/** Очищает текст, ожидающий переноса в редактор обычного чата. */
export const clearPendingMessageDraft = (): void => {
  pendingDraftTopicId.value = null;
  pendingDraftText.value = '';
};

/** Переносит внешний текст в редактор выбранного диалога или группы. */
export const openMessageDraft = (
  topic: ITopic,
  text: string,
  source?: AiConversationSource
): void => {
  const normalizedText = text.trim();
  if (!topic?.id || !normalizedText) {
    clearPendingMessageDraft();
    return;
  }

  pendingDraftTopicId.value = topic.id;
  pendingDraftText.value = normalizedText;
  aiSources.delete(topic.id);
  if (source)
    aiSources.set(topic.id, {
      text: normalizedText,
      source: aiConversationSourceSchema.parse(source)
    });

  if (topic.type === TopicType.DM) {
    navigateToDialogs(topic.id);
    return;
  }

  navigateToGroup(topic.id);
};

/** Возвращает ожидающий текст только редактору выбранного чата. */
export const consumePendingMessageDraft = (topicId?: string | null): string => {
  if (!topicId || pendingDraftTopicId.value !== topicId) return '';

  const text = pendingDraftText.value;
  clearPendingMessageDraft();
  return text;
};

export const usePendingMessageDraft = () => ({
  pendingDraftTopicId,
  pendingDraftText,
  openMessageDraft,
  clearPendingMessageDraft,
  consumePendingMessageDraft
});
