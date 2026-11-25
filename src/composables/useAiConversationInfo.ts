import { ref, shallowRef } from 'vue';
import {
  fetchAiConversationInfo,
  type AiConversationInfo,
  type AiConversationSource
} from '../services/aiConversationInfo';

const isOpen = ref(false);
const source = shallowRef<{
  request: Promise<AiConversationInfo> | null;
  localThreadId?: string;
}>({
  request: null
});
let pendingRequest: AbortController | undefined;

export function useAiConversationInfo(): {
  isOpen: typeof isOpen;
  source: typeof source;
  open: (
    threadId: string | null,
    expected?: AiConversationSource,
    local?: boolean
  ) => void;
  close: () => void;
} {
  return {
    isOpen,
    source,
    open: (threadId, expected, local): void => {
      pendingRequest?.abort();
      pendingRequest = threadId && !local ? new AbortController() : undefined;
      const request =
        threadId && !local
          ? fetchAiConversationInfo(threadId, expected, pendingRequest?.signal)
          : null;
      // Запрос может завершиться до загрузки компонента панели.
      void request?.catch((): void => {});
      source.value = {
        request,
        localThreadId: local ? threadId ?? undefined : undefined
      };
      isOpen.value = true;
    },
    close: (): void => {
      isOpen.value = false;
      pendingRequest?.abort();
      pendingRequest = undefined;
    }
  };
}
