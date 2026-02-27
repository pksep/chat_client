import { ref, watch, type Ref } from 'vue';
import { useMastra } from '../../../services/useMastra';
import { generateUUID } from '../../../utils/generateUUID';
import { removeMessageLoading } from '../../../services/useChatDb';

export function useMessageMastra(
  route: Ref<{ id: string; type: string }>,
  state: { chatId: string | null; aiMessages: any[] },
  props: { baseUrl?: string }
) {
  const mastraResult = ref<any>(null);

  const initializeMastra = () => {
    if (state.chatId && props.baseUrl) {
      const result = useMastra({
        agentId: 'generalAgent',
        chatId: state.chatId,
        baseUrl: props.baseUrl
      });
      mastraResult.value = result;

      watch(
        () => result.messages.value,
        newMessages => {
          state.aiMessages = [...newMessages];
        },
        { deep: true }
      );
    } else {
      const result = useMastra(false);
      mastraResult.value = result;

      watch(
        () => result.messages.value,
        newMessages => {
          state.aiMessages = [...newMessages];
        },
        { deep: true }
      );
    }
  };

  const handleMastraMounted = () => {
    if (route.value && route.value.type === 'AI' && !state.chatId) {
      state.chatId = generateUUID();
    }
  };

  const handleMastraUnmounted = () => {
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
