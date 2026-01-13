import { onUnmounted, ref } from 'vue';
import { fetchConversationList } from '../services/useConversions';

const isPollingActive = ref(false);
let pollingIntervalId: number | null = null;

/**
 * Composable for polling unread messages.
 * IMPORTANT: This composable must be called synchronously in the component's
 * setup function (not inside async callbacks or after await statements) to
 * properly register lifecycle hooks.
 *
 * @param pollingInterval - Interval in milliseconds between polls (default: 30000)
 * @param autoStart - Whether to start polling immediately (default: false).
 *                    Set to false when initialization needs to complete first.
 */
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

  // Register cleanup hook synchronously during setup
  onUnmounted(() => {
    stopPolling();
  });

  // Optionally start polling immediately
  if (autoStart) {
    startPolling();
  }

  return {
    startPolling,
    stopPolling,
    isPollingActive: isPollingActive.value
  };
};
