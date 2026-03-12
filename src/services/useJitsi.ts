import { ref, reactive, computed, nextTick } from 'vue';
import { getChatSDK } from '../services/useChat';
import type { IUser } from '../components/interfaces/interfaces';
import { getAuthUser } from '../composables/useAuth';
import { WebSocketEventType } from './useChatSDK/websocketEvents';

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
const state = reactive({
  isFullScreen: false,
  isMicActive: true,
  isVideoActive: true
});

let jitsiApi: any = null;
let timerInterval: any = null;

const startTimer = () => {
  timerSeconds.value = 0;
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

const formattedTime = computed(() => formatTime(timerSeconds.value));

export function useJitsi() {
  const startCall = async (u: IUser, currentTopicId?: string) => {
    if (open.value || openCall.value || isIncoming.value) return;

    user.value = u;
    open.value = true;
    isCalling.value = true;
    topicId.value = currentTopicId || null;

    const currentRoom = currentTopicId ? `Chat_${currentTopicId}` : `Call_${Date.now()}`;
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

  const receiveCall = (u: IUser, incomingRoomId: string, incomingTopicId: string) => {
    if (open.value || openCall.value || isIncoming.value) return;

    user.value = u;
    isIncoming.value = true;
    openCall.value = true;
    roomId.value = incomingRoomId;
    topicId.value = incomingTopicId;
  };

  const confirmAnswer = async () => {
    if (!isIncoming.value || !user.value || !roomId.value) return;

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

      jitsiApi = await sdk.startCall(me, currentRoom, jitsiContainer.value, token || undefined);
      setupApiListeners(jitsiApi);
      startTimer();
    }
  };

  const rejectCall = () => {
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

        jitsiApi = await sdk.startCall(me, currentRoom, jitsiContainer.value, token || undefined);
        setupApiListeners(jitsiApi);
        startTimer();
      }
    }
  };

  const handleCallEnded = () => {
    console.log('Call ended by remote peer');
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
    isIncoming.value = false;
    isCalling.value = false;
    user.value = null;
    roomId.value = null;
    topicId.value = null;
    state.isFullScreen = false;
    state.isMicActive = true;
    state.isVideoActive = true;
  };

  const setupApiListeners = (api: any) => {
    if (!api) return;

    api.addEventListeners({
      videoConferenceLeft: () => {
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

  return {
    open: computed(() => open.value),
    openCall: computed(() => openCall.value),
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
  leaveCall,
  handleCallAnswered,
  handleCallEnded
} = jitsi;

export {
  open,
  openCall,
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
