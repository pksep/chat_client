import { ref, computed } from 'vue';
import {
  confirmAnswer as confirmJitsi,
  rejectCall as rejectJitsi,
  receiveCall as receiveJitsi,
  handleCallAnswered as handleJitsiAnswered,
  handleCallEnded as handleJitsiEnded,
  cleanup as cleanupJitsi,
  open as isJitsiOpen,
  openCall as isJitsiOpenCall,
  isModalVisible as isJitsiModalVisible,
  user as jitsiUser,
  formattedTime as jitsiFormattedTime,
  isCalling as isJitsiCalling
} from './useJitsi';
import {
  acceptWebRTCCall,
  endWebRTCCall,
  receiveWebRTCCall,
  handleCallAnswered as handleWebRTCAnswered,
  cleanup as cleanupWebRTC,
  isWebRTCOpen,
  isWebRTCModalVisible,
  webRTCUser,
  formattedTime as webRTCFormattedTime,
  isWebRTCCalling,
  isWebRTCIncoming
} from './useWebRTC';

export enum CallType {
  JITSI = 'jitsi',
  WEBRTC = 'webrtc'
}

export const currentCallType = ref<CallType | string | null>(null);

export const activeCallUser = computed(() => {
  if (currentCallType.value === CallType.WEBRTC) return webRTCUser.value;
  return jitsiUser.value;
});

export const isCallActive = computed(
  () => isJitsiOpen.value || isJitsiOpenCall.value || isWebRTCOpen.value
);

export const isAnyCallModalVisible = computed(
  () => isJitsiModalVisible.value || isWebRTCModalVisible.value
);

export const isAnyCallDialing = computed(
  () => isJitsiCalling.value || isWebRTCCalling.value
);

export const isAnyCallIncoming = computed(
  () =>
    (isJitsiOpenCall.value && !isJitsiCalling.value) || isWebRTCIncoming.value
);

export const activeCallFormattedTime = computed(() => {
  if (currentCallType.value === CallType.WEBRTC)
    return webRTCFormattedTime.value;
  return jitsiFormattedTime.value;
});

export const handleIncomingCall = (
  user: any,
  roomId: string,
  topicId: string,
  callType?: string
) => {
  currentCallType.value = callType || CallType.JITSI;

  if (currentCallType.value === CallType.WEBRTC) {
    receiveWebRTCCall(user, roomId, topicId);
  } else {
    receiveJitsi(user, roomId, topicId);
  }
};

export const acceptCall = () => {
  if (currentCallType.value === CallType.WEBRTC) {
    acceptWebRTCCall();
  } else {
    confirmJitsi();
  }
};

export const declineCall = () => {
  if (currentCallType.value === CallType.WEBRTC) {
    endWebRTCCall();
  } else {
    rejectJitsi();
  }
};

export const showCallModal = () => {
  if (currentCallType.value === CallType.WEBRTC) {
    isWebRTCModalVisible.value = true;
  } else {
    isJitsiModalVisible.value = true;
  }
};

export const handleCallAnswered = (userId: string) => {
  handleJitsiAnswered(userId);
  handleWebRTCAnswered(userId);
};

export const handleCallEnded = () => {
  handleJitsiEnded();
  cleanupWebRTC();
  currentCallType.value = null;
};

export const cleanupAllCalls = () => {
  cleanupJitsi();
  cleanupWebRTC();
  currentCallType.value = null;
};
