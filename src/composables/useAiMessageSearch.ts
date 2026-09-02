import { readonly, ref } from 'vue';

export interface AiMessageSearchTarget {
  sessionId: string;
  messageId: string;
  requestId: number;
}

const activeTarget = ref<AiMessageSearchTarget | null>(null);
let requestId = 0;

/** Передаёт открытому ИИ-чату сообщение, к которому нужно перейти. */
export const navigateToAiMessageSearchResult = (
  sessionId: string,
  messageId: string
): void => {
  requestId += 1;
  activeTarget.value = { sessionId, messageId, requestId };
};

/** Снимает подсветку результата при закрытии поиска или смене чата. */
export const clearAiMessageSearchResult = (): void => {
  activeTarget.value = null;
};

export const useAiMessageSearch = () => ({
  activeTarget: readonly(activeTarget)
});
