import { ref, shallowRef } from 'vue';
import type { AiConversationSource } from '../services/aiConversationInfo';

const isOpen = ref(false);
const source = shallowRef<{
  threadId: string | null;
  expected?: AiConversationSource;
}>({ threadId: null });

export function useAiConversationInfo(): {
  isOpen: typeof isOpen;
  source: typeof source;
  open: (threadId: string | null, expected?: AiConversationSource) => void;
  close: () => void;
} {
  return {
    isOpen,
    source,
    open: (threadId, expected): void => {
      source.value = { threadId, expected };
      isOpen.value = true;
    },
    close: (): void => {
      isOpen.value = false;
    }
  };
}
