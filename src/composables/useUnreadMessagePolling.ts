import { onUnmounted, ref } from 'vue';
import { fetchConversationList } from '../services/useConversions';

const isPollingActive = ref(false);
let pollingIntervalId: number | null = null;

export const useUnreadMessagePolling = (
  pollingInterval: number = 30000,
  autoStart: boolean = false
) => {
  const startPolling = () => {
    if (isPollingActive.value) {
      console.warn('Polling is already active');
      return;
    }

    isPollingActive.value = true;

    fetchConversationList().catch(error => {
      console.error(
        'Failed to fetch conversation list on polling start:',
        error
      );
    });

    pollingIntervalId = window.setInterval(() => {
      if (isPollingActive.value) {
        fetchConversationList().catch(error => {
          console.error(
            'Failed to fetch conversation list during polling:',
            error
          );
        });
      }
    }, pollingInterval);

    console.log(
      `Started unread message polling with interval: ${pollingInterval}ms`
    );
  };

  const stopPolling = () => {
    if (pollingIntervalId !== null) {
      window.clearInterval(pollingIntervalId);
      pollingIntervalId = null;
    }
    isPollingActive.value = false;
    console.log('Stopped unread message polling');
  };

  onUnmounted(() => {
    stopPolling();
  });

  if (autoStart) {
    startPolling();
  }

  return {
    startPolling,
    stopPolling,
    isPollingActive: isPollingActive.value
  };
};
