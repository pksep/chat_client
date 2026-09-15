import { ref, watch, type Ref, type WatchStopHandle } from 'vue';
import { generateUUID } from '../../../utils/generateUUID';
import { removeMessageLoading } from '../../../services/useChatDb';
import { RouteTypes } from '../../../composables/navigation/useUrlRouting';
import type { AiAttachmentReference } from '../../../services/aiAttachments';
import type { AiSubmissionResult } from '../../../services/aiSubmission';

type MastraResult = {
  messages: Ref<any[]>;
  sendMessage: (
    input: string,
    onFinish?: () => void,
    abortSignal?: AbortSignal,
    attachments?: AiAttachmentReference[]
  ) => Promise<AiSubmissionResult>;
  clearMessages: () => void;
  isInitializing: Ref<boolean>;
};

const createDisabledMastraResult = (): MastraResult => ({
  messages: ref([]),
  sendMessage: async () => ({ accepted: false, responseText: null }),
  clearMessages: () => {},
  isInitializing: ref(false)
});

export function useMessageMastra(
  route: Ref<{ id: string; type: string }>,
  state: { chatId: string | null; aiMessages: any[] },
  props: { baseUrl?: string }
) {
  const mastraResult = ref<any>(null);
  let initializeRequestId = 0;
  let stopWatchingMessages: WatchStopHandle | null = null;

  const bindMastraMessages = (result: MastraResult) => {
    stopWatchingMessages?.();
    stopWatchingMessages = watch(
      () => result.messages.value,
      newMessages => {
        state.aiMessages = [...newMessages];
      },
      { deep: true }
    );
  };

  const initializeMastra = async () => {
    const requestId = ++initializeRequestId;

    if (state.chatId) {
      const { useMastra } = await import('../../../services/useMastra');

      if (requestId !== initializeRequestId) {
        return;
      }

      const result = useMastra({
        agentId: 'generalAgent',
        chatId: state.chatId,
        ...(props.baseUrl ? { baseUrl: props.baseUrl } : {})
      });
      mastraResult.value = result;
      bindMastraMessages(result);
    } else {
      const result = createDisabledMastraResult();
      mastraResult.value = result;
      bindMastraMessages(result);
    }
  };

  const handleMastraMounted = () => {
    if (route.value && route.value.type === RouteTypes.AI && !state.chatId) {
      state.chatId = generateUUID();
    }
  };

  const handleMastraUnmounted = () => {
    stopWatchingMessages?.();
    stopWatchingMessages = null;

    if (state.chatId) {
      removeMessageLoading(state.chatId, state.aiMessages.length);
    }
  };

  const clearAiMessages = () => {
    if (mastraResult.value) {
      return mastraResult.value.clearMessages();
    }
  };

  return {
    mastraResult,
    initializeMastra,
    handleMastraMounted,
    handleMastraUnmounted,
    clearAiMessages
  };
}
