import { ref, reactive, computed, nextTick, watch } from 'vue';
import { Capacitor } from '@capacitor/core';
import { getChatSDK } from '../services/useChat';
import type { IUser } from '../components/interfaces/interfaces';
import { getAuthUser } from '../composables/useAuth';
import { WebSocketEventType } from './useChatSDK/websocketEvents';
import { navigateToGroup, navigateToDialogs } from '../composables/navigation';
import { useTopics } from '../composables/useTopics';
import { TopicType } from './useChatSDK/types';
import { endAllCallKits } from './useCallKit';

// Global state
const open = ref(false);
const openCall = ref(false);
const isIncoming = ref(false);
const isCalling = ref(false);
const user = ref<IUser | null>(null);
const roomId = ref<string | null>(null);
const topicId = ref<string | null>(null);
const timerSeconds = ref(0);
const jitsiContainer = ref<HTMLElement | null>(null);
const isJitsiReady = ref(false);
const isModalVisible = ref(false);
const state = reactive({
  isFullScreen: false,
  isMicActive: false,
  isVideoActive: false,
  isSpeakerActive: true
});

let jitsiApi: any = null;
let timerInterval: any = null;
let ringtoneAudio: HTMLAudioElement | null = null;

const playRingtone = () => {
  // If native mobile, the plugin handles the ringtone
  if (Capacitor.isNativePlatform()) return;

  if (ringtoneAudio) return;
  ringtoneAudio = new Audio('/audio/ringtone.mp3');
  ringtoneAudio.loop = true;
  ringtoneAudio
    .play()
    .catch(err => console.warn('[Jitsi] Ringtone play failed:', err));

  if ('vibrate' in navigator) {
    navigator.vibrate([1000, 500, 1000, 500]);
  }
};

const stopRingtone = () => {
  if (ringtoneAudio) {
    ringtoneAudio.pause();
    ringtoneAudio = null;
  }
  if ('vibrate' in navigator) {
    navigator.vibrate(0); // Stop vibration
  }
};

const startTimer = () => {
  if (timerSeconds.value > 0) return;
  timerInterval = setInterval(() => {
    timerSeconds.value++;
  }, 1000);
};

const stopTimer = () => {
  if (timerInterval) clearInterval(timerInterval);
  timerSeconds.value = 0;
};

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const formattedTime = computed(() => {
  if (
    !isJitsiReady.value &&
    (open.value || openCall.value) &&
    !isIncoming.value &&
    !isCalling.value
  ) {
    return 'Участник ответил, подключено...';
  }
  console.log(
    '#########',
    isJitsiReady.value,
    open.value,
    openCall.value,
    isIncoming.value,
    isCalling.value
  );

  return formatTime(timerSeconds.value);
});

// Setup observer to detect when Jitsi iframe is injected and loaded
let jitsiObserver: MutationObserver | null = null;

const observeJitsiIframe = () => {
  if (!jitsiContainer.value) return;

  if (jitsiObserver) {
    jitsiObserver.disconnect();
  }

  jitsiObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        const addedNodes = Array.from(mutation.addedNodes);
        const iframe = addedNodes.find(
          node => node.nodeName === 'IFRAME'
        ) as HTMLIFrameElement;

        if (iframe) {
          console.log('[Jitsi] Iframe inserted into DOM');
          // Start a failsafe timer in case iframe onload fails
          const fallbackTimeout = setTimeout(() => {
            if (!isJitsiReady.value) {
              console.log('[Jitsi] Fallback timer triggered');
              isJitsiReady.value = true;
              startTimer();
            }
          }, 2000);

          iframe.onload = () => {
            console.log('[Jitsi] Iframe fully loaded');
            clearTimeout(fallbackTimeout);
            if (!isJitsiReady.value) {
              isJitsiReady.value = true;
              startTimer();
            }
          };

          jitsiObserver?.disconnect();
          jitsiObserver = null;
        }
      }
    }
  });

  jitsiObserver.observe(jitsiContainer.value, {
    childList: true,
    subtree: true
  });
};

watch(jitsiContainer, newVal => {
  if (newVal) {
    observeJitsiIframe();
  } else if (jitsiObserver) {
    jitsiObserver.disconnect();
    jitsiObserver = null;
  }
});

export function useJitsi() {
  const startCall = async (u: IUser, currentTopicId?: string) => {
    if (open.value || openCall.value || isIncoming.value) return;

    user.value = u;
    open.value = true;
    isModalVisible.value = true;
    isCalling.value = true;
    topicId.value = currentTopicId || null;

    const currentRoom = currentTopicId
      ? `Chat_${currentTopicId}`
      : `Call_${Date.now()}`;
    roomId.value = currentRoom;

    await nextTick();

    const sdk = getChatSDK();
    const me = getAuthUser();
    if (!sdk || !me) return;

    // Send call signaling, but do NOT start Jitsi until receiver answers
    sdk.sendWebSocketEvent(WebSocketEventType.START_CALL, {
      roomId: currentRoom,
      userId: me.id,
      topicId: currentTopicId || currentRoom
    });
  };

  const receiveCall = (
    u: IUser,
    incomingRoomId: string,
    incomingTopicId: string
  ) => {
    if (open.value || openCall.value || isIncoming.value) return;

    user.value = u;
    isIncoming.value = true;
    openCall.value = true;
    isModalVisible.value = true;
    roomId.value = incomingRoomId;
    topicId.value = incomingTopicId;
    playRingtone();
  };

  const confirmAnswer = async () => {
    if (!isIncoming.value || !user.value || !roomId.value) return;

    stopRingtone();
    if (Capacitor.isNativePlatform()) {
      endAllCallKits();
    }

    isIncoming.value = false;
    await nextTick();

    if (jitsiContainer.value) {
      const sdk = getChatSDK();
      const me = getAuthUser();
      if (!sdk || !me) return;

      const currentRoom = roomId.value;

      const token = await sdk.getJitsiToken(currentRoom, me.id);

      sdk.sendWebSocketEvent(WebSocketEventType.ANSWER_CALL, {
        roomId: currentRoom,
        userId: me.id,
        topicId: topicId.value || currentRoom
      });

      jitsiApi = await sdk.startCall(
        me,
        currentRoom,
        jitsiContainer.value,
        token || undefined
      );

      // Navigate to the topic if it's not already active
      if (topicId.value) {
        const { getSelectedTopic } = useTopics();
        const topic = getSelectedTopic(topicId.value);

        if (topic?.type === TopicType.DM) {
          navigateToDialogs(topicId.value);
        } else {
          navigateToGroup(topicId.value);
        }
      }

      window.focus();
      setupApiListeners(jitsiApi);
    }
  };

  const rejectCall = () => {
    stopRingtone();
    if (Capacitor.isNativePlatform()) {
      endAllCallKits();
    }

    const sdk = getChatSDK();
    if (sdk && roomId.value && topicId.value) {
      sdk.sendWebSocketEvent(WebSocketEventType.END_CALL, {
        roomId: roomId.value,
        userId: user.value?.id || '',
        topicId: topicId.value
      });
    }
    cleanup();
  };

  const handleCallAnswered = async (uId: string) => {
    console.log(`User ${uId} answered the call`);

    // If we are the caller and Jitsi hasn't started yet, start it now
    if (isCalling.value && !jitsiApi && roomId.value) {
      const sdk = getChatSDK();
      const me = getAuthUser();
      if (!sdk || !me) return;

      isCalling.value = false;
      await nextTick();

      if (jitsiContainer.value) {
        const currentRoom = roomId.value;
        const token = await sdk.getJitsiToken(currentRoom, me.id);

        jitsiApi = await sdk.startCall(
          me,
          currentRoom,
          jitsiContainer.value,
          token || undefined
        );

        if (topicId.value) {
          const { getSelectedTopic } = useTopics();
          const topic = getSelectedTopic(topicId.value);

          if (topic?.type === TopicType.DM) {
            navigateToDialogs(topicId.value);
          } else {
            navigateToGroup(topicId.value);
          }
        }

        window.focus();

        setupApiListeners(jitsiApi);
        stopRingtone();
      }
    }
  };

  const handleCallEnded = () => {
    console.log('Call ended by remote peer');
    stopRingtone();
    cleanup();
  };

  const leaveCall = () => {
    const sdk = getChatSDK();
    if (sdk && roomId.value && topicId.value) {
      sdk.sendWebSocketEvent(WebSocketEventType.END_CALL, {
        roomId: roomId.value,
        userId: user.value?.id || '',
        topicId: topicId.value
      });
      sdk.endCall();
    }
    cleanup();
  };

  const cleanup = () => {
    stopTimer();
    jitsiApi = null;
    open.value = false;
    openCall.value = false;
    isModalVisible.value = false;
    isIncoming.value = false;
    isCalling.value = false;
    user.value = null;
    roomId.value = null;
    topicId.value = null;
    state.isFullScreen = false;
    state.isVideoActive = false;
    isJitsiReady.value = false;
    stopRingtone();
    if (Capacitor.isNativePlatform()) {
      endAllCallKits();
    }
  };

  const setupApiListeners = (api: any) => {
    if (!api) return;

    api.addEventListeners({
      videoConferenceLeft: () => {
        console.log('[Jitsi] Local user left conference');
        leaveCall();
      },
      readyToClose: () => {
        leaveCall();
      },
      audioMuteStatusChanged: (event: any) => {
        state.isMicActive = !event.muted;
      },
      videoMuteStatusChanged: (event: any) => {
        state.isVideoActive = !event.muted;
      }
    });
  };

  const toggleMic = () => {
    state.isMicActive = !state.isMicActive;
    const sdk = getChatSDK();
    sdk?.executeJitsiCommand('toggleAudio');
  };

  const toggleVideo = () => {
    state.isVideoActive = !state.isVideoActive;
    const sdk = getChatSDK();
    sdk?.executeJitsiCommand('toggleVideo');
  };

  const toggleFullScreen = () => {
    state.isFullScreen = !state.isFullScreen;
  };

  const toggleAudioOutput = async () => {
    state.isSpeakerActive = !state.isSpeakerActive;

    if (Capacitor.isNativePlatform()) {
      // Audio output switching requires a native plugin. 
      // Since we are not touching node_modules, we will implement this 
      // via a standard Capacitor bridge if available in the future.
      console.info('[Jitsi] Mobile audio output switching triggered:', state.isSpeakerActive ? 'speaker' : 'earpiece');
    } else {
      const sdk = getChatSDK();
      sdk?.executeJitsiCommand('setVolume', state.isSpeakerActive ? 1 : 0.2);
    }
  };

  return {
    open: computed(() => open.value),
    openCall: computed(() => openCall.value),
    isModalVisible,
    isIncoming: computed(() => isIncoming.value),
    isCalling: computed(() => isCalling.value),
    user: computed(() => user.value),
    roomId: computed(() => roomId.value),
    topicId: computed(() => topicId.value),
    state,
    timerSeconds,
    formattedTime,
    jitsiContainer,
    startCall,
    receiveCall,
    confirmAnswer,
    rejectCall,
    handleCallAnswered,
    handleCallEnded,
    toggleMic,
    toggleVideo,
    toggleFullScreen,
    toggleAudioOutput,
    leaveCall
  };
}

// Named exports for compatibility with existing imports in components
const jitsi = useJitsi();
export const {
  startCall,
  receiveCall,
  confirmAnswer,
  rejectCall,
  toggleMic,
  toggleVideo,
  toggleFullScreen,
  toggleAudioOutput,
  leaveCall,
  handleCallAnswered,
  handleCallEnded
} = jitsi;

export {
  isJitsiReady,
  open,
  openCall,
  isModalVisible,
  isIncoming,
  isCalling,
  user,
  roomId,
  topicId,
  state,
  jitsiContainer,
  timerSeconds,
  formattedTime
};
