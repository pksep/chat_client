<template>
  <main class="call-window-view" data-testid="CallWindowView">
    <CallModal v-if="shouldRenderCallModal" />
    <div v-else class="call-window-view__placeholder" role="status">
      {{ statusText }}
    </div>
  </main>
</template>

<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  onMounted,
  onUnmounted,
  ref,
  watch
} from 'vue';
import { getAuthUser } from '../composables/useAuth';
import {
  isCalling,
  isIncoming,
  isModalVisible,
  open,
  state as callState,
  invitedGroupCall as invitedGroupCallState
} from '../services/useCallState';
import { getChatSDK } from '../services/useChat';
import {
  closeCurrentCallWindow,
  markCallWindow,
  readCallWindowIntentFromUrl,
  subscribeToCallWindowIntents,
  type CallWindowIntent,
  type CallWindowMediaState
} from '../services/useCallWindow';
import {
  applyCallWindowDocumentIcon,
  restoreDefaultDocumentIcon
} from '../services/useDocumentAppIcon';

const CallModal = defineAsyncComponent(
  () => import('./CallModal/CallModal.vue')
);

const statusText = ref('Preparing call...');
const hasSeenCallRuntime = ref(false);
const hasScheduledClose = ref(false);
const handledIntentIds = new Set<string>();
let unsubscribeIntentListener: (() => void) | null = null;

const shouldRenderCallModal = computed(
  () =>
    open.value || isModalVisible.value || isCalling.value || isIncoming.value
);

const isRuntimeReady = (): boolean => {
  const sdk = getChatSDK();

  return !!getAuthUser() && !!sdk && sdk.isConnected();
};

const waitForRuntimeReady = async (): Promise<boolean> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 15000) {
    if (isRuntimeReady()) {
      return true;
    }

    await new Promise(resolve => {
      window.setTimeout(resolve, 150);
    });
  }

  return isRuntimeReady();
};

const applyMediaState = (mediaState?: CallWindowMediaState): void => {
  callState.isFullScreen = false;

  if (!mediaState) {
    return;
  }

  callState.isMicActive = mediaState.isMicActive;
  callState.isVideoActive = mediaState.isVideoActive;
  callState.isScreenSharingActive = mediaState.isScreenSharingActive;
  callState.isSpeakerActive = mediaState.isSpeakerActive;
};

const hasLocalCallRuntime = (): boolean =>
  open.value || isIncoming.value || isCalling.value;

const scheduleCallWindowClose = (): void => {
  if (hasScheduledClose.value) {
    return;
  }

  hasScheduledClose.value = true;
  statusText.value = 'Call ended';

  window.setTimeout(() => {
    void closeCurrentCallWindow();
  }, 450);
};

const handleIntent = async (intent: CallWindowIntent | null): Promise<void> => {
  if (!intent || handledIntentIds.has(intent.id)) {
    return;
  }

  handledIntentIds.add(intent.id);
  statusText.value = 'Preparing call...';

  if (hasLocalCallRuntime() && intent.kind !== 'show-active') {
    isModalVisible.value = true;
    return;
  }

  const ready = await waitForRuntimeReady();

  if (!ready) {
    statusText.value = 'Call is waiting for connection...';
    return;
  }

  applyMediaState(intent.mediaState);

  const liveKit = await import('../services/useLiveKit');
  const activeRoomId = intent.roomId || intent.callId;

  if (intent.kind === 'direct-outgoing') {
    if (!intent.user || !intent.topicId) {
      return;
    }

    await liveKit.startLiveKitCall(intent.user, intent.topicId, {
      roomId: activeRoomId
    });
  } else if (intent.kind === 'group-start') {
    if (!intent.topicId) {
      return;
    }

    await liveKit.startLiveKitGroupCall(intent.topicId, {
      roomId: activeRoomId
    });
  } else if (intent.kind === 'standalone-start') {
    await liveKit.startStandaloneMeetingCall({
      roomId: activeRoomId
    });
  } else if (intent.kind === 'incoming-direct') {
    if (!intent.topicId) {
      return;
    }

    await liveKit.receiveIncomingCall(
      intent.user || null,
      activeRoomId,
      intent.topicId,
      intent.topicType,
      intent.startTime
    );
  } else if (intent.kind === 'join-group') {
    if (!intent.topicId) {
      return;
    }

    if (intent.activeGroupCall) {
      await liveKit.syncActiveCalls([
        {
          ...intent.activeGroupCall,
          callType: 'livekit'
        }
      ]);
    }

    await liveKit.joinPendingGroupCall(intent.topicId);
  } else if (intent.kind === 'join-invite') {
    if (!intent.invitedGroupCall) {
      return;
    }

    invitedGroupCallState.value = intent.invitedGroupCall;
    await liveKit.joinInvitedGroupCall();
  } else if (intent.kind === 'show-active') {
    isModalVisible.value = true;
  }
};

onMounted(() => {
  markCallWindow();
  applyCallWindowDocumentIcon();

  unsubscribeIntentListener = subscribeToCallWindowIntents(intent => {
    void handleIntent(intent);
  });

  void handleIntent(readCallWindowIntentFromUrl());
});

onUnmounted(() => {
  unsubscribeIntentListener?.();
  unsubscribeIntentListener = null;
  restoreDefaultDocumentIcon();
});

watch(
  shouldRenderCallModal,
  isRuntimeVisible => {
    if (isRuntimeVisible) {
      hasSeenCallRuntime.value = true;
      hasScheduledClose.value = false;
      return;
    }

    if (hasSeenCallRuntime.value) {
      scheduleCallWindowClose();
    }
  },
  { flush: 'post' }
);
</script>

<style scoped>
.call-window-view {
  min-height: 100dvh;
  background: var(--chat-background, #f5f7fa);
}

.call-window-view__placeholder {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  color: var(--text-grey);
  font-size: 14px;
}
</style>
