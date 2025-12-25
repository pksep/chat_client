import { onMounted, onUnmounted, ref } from 'vue';
import { fetchConversationList } from '../services/useConversions';

const isPollingActive = ref(false);
let pollingIntervalId: number | null = null;

/**
 * Composable to handle polling for unread messages
 * This ensures that unread message counts are updated even if WebSocket events fail
 */
export const useUnreadMessagePolling = (pollingInterval: number = 30000) => {
  const startPolling = () => {
    if (isPollingActive.value) {
      console.warn('Polling is already active');
      return;
    }

    isPollingActive.value = true;

    // Initial fetch
    fetchConversationList().catch(error => {
      console.error(
        'Failed to fetch conversation list on polling start:',
        error
      );
    });

    // Set up the polling interval
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

  onMounted(() => {
    // Start polling when composable is mounted
    startPolling();
  });

  onUnmounted(() => {
    // Stop polling when composable is unmounted
    stopPolling();
  });

  return {
    startPolling,
    stopPolling,
    isPollingActive: isPollingActive.value
  };
};
