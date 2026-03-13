import { ref, reactive, computed } from 'vue';
import { getChatSDK } from '../services/useChat';
import type { IUser } from '../components/interfaces/interfaces';
import { getAuthUser } from '../composables/useAuth';
import { WebSocketEventType } from './useChatSDK/websocketEvents';
import { getUserById } from '../composables/useUsers';

// Global state for WebRTC
const isWebRTCOpen = ref(false);
const isWebRTCIncoming = ref(false);
const isWebRTCCalling = ref(false);
const webRTCUser = ref<IUser | null>(null);
const webRTCRoomId = ref<string | null>(null);
const webRTCTopicId = ref<string | null>(null);
const webRTCTimerSeconds = ref(0);
const localStream = ref<MediaStream | null>(null);
const remoteStream = ref<MediaStream | null>(null);
const peerConnection = ref<RTCPeerConnection | null>(null);
const pendingIceCandidates = ref<RTCIceCandidateInit[]>([]);
const isWebRTCModalVisible = ref(false);

const webRTCState = reactive({
  isMicActive: true,
  isVideoActive: true,
  isSpeakerActive: true,
  isFullScreen: false
});

let webRTCTimerInterval: any = null;
let ringtoneAudio: HTMLAudioElement | null = null;

const playRingtone = () => {
  if (ringtoneAudio) return;
  ringtoneAudio = new Audio('/audio/ringtone.mp3');
  ringtoneAudio.loop = true;
  ringtoneAudio
    .play()
    .catch(err => console.warn('[WebRTC] Ringtone play failed:', err));
};

const stopRingtone = () => {
  if (ringtoneAudio) {
    ringtoneAudio.pause();
    ringtoneAudio = null;
  }
};

const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' }
];

const startTimer = () => {
  if (webRTCTimerSeconds.value > 0) return;
  webRTCTimerInterval = setInterval(() => {
    webRTCTimerSeconds.value++;
  }, 1000);
};

const stopTimer = () => {
  if (webRTCTimerInterval) clearInterval(webRTCTimerInterval);
  webRTCTimerSeconds.value = 0;
};

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const formattedTime = computed(() => formatTime(webRTCTimerSeconds.value));

export function useWebRTC() {
  const createPeerConnection = (toUserId: string) => {
    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = event => {
      if (event.candidate) {
        const sdk = getChatSDK();
        if (sdk && webRTCRoomId.value && webRTCTopicId.value) {
          sdk.sendWebSocketEvent(WebSocketEventType.WEBRTC_ICE_CANDIDATE, {
            toUserId,
            candidate: event.candidate,
            roomId: webRTCRoomId.value,
            topicId: webRTCTopicId.value
          });
        }
      }
    };

    pc.ontrack = event => {
      console.log('[WebRTC] Received remote track:', event.track.kind);
      if (event.streams && event.streams[0]) {
        remoteStream.value = event.streams[0];
      } else {
        if (!remoteStream.value) {
          remoteStream.value = new MediaStream();
        }
        remoteStream.value.addTrack(event.track);
      }

      // Force a shallow copy to trigger Vue reactivity if tracks were added
      if (remoteStream.value) {
        remoteStream.value = new MediaStream(remoteStream.value.getTracks());
      }

      startTimer();
    };

    if (localStream.value) {
      localStream.value.getTracks().forEach(track => {
        pc.addTrack(track, localStream.value!);
      });
    }

    peerConnection.value = pc;
    return pc;
  };

  const getMediaStream = async () => {
    try {
      // Try both video and audio
      return await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
    } catch (err) {
      console.warn(
        '[WebRTC] Failed to get both video and audio, trying audio only...',
        err
      );
      try {
        // Fallback to audio only
        return await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true
        });
      } catch (err2) {
        console.error('[WebRTC] Failed to get audio only:', err2);
        throw err2;
      }
    }
  };

  const startWebRTCCall = async (u: IUser, currentTopicId: string) => {
    if (isWebRTCOpen.value || isWebRTCIncoming.value) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const isHttp = window.location.protocol === 'http:';
      const isNotLocalhost = !['localhost', '127.0.0.1'].includes(
        window.location.hostname
      );

      if (isHttp && isNotLocalhost) {
        alert(
          'WebRTC requires a secure context (HTTPS or localhost). \n\nTo use it on this IP address, you must enable "unsafely-treat-insecure-origin-as-secure" in your browser flags or use HTTPS.'
        );
      } else {
        alert('Media devices are not supported or access is denied.');
      }
      return;
    }

    webRTCUser.value = u;
    isWebRTCOpen.value = true;
    isWebRTCCalling.value = true;
    isWebRTCModalVisible.value = true;
    webRTCTopicId.value = currentTopicId;
    webRTCRoomId.value = `WebRTC_${Date.now()}`;

    try {
      console.log('[WebRTC] Requesting local media...');
      localStream.value = await getMediaStream();

      console.log('[WebRTC] Local media obtained, creating PC...');
      const pc = createPeerConnection(u.id);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdk = getChatSDK();
      if (sdk) {
        console.log('[WebRTC] Sending offer to', u.id);
        sdk.sendWebSocketEvent(WebSocketEventType.WEBRTC_OFFER, {
          toUserId: u.id,
          offer,
          roomId: webRTCRoomId.value!,
          topicId: webRTCTopicId.value!
        });
      }
    } catch (err) {
      console.error('[WebRTC] Failed to start call:', err);
      cleanup();
    }
  };

  const handleOffer = async (
    fromUserId: string,
    offer: RTCSessionDescriptionInit,
    roomId: string,
    topicId: string
  ) => {
    console.log('[WebRTC] Handling offer from', fromUserId, {
      roomId,
      topicId
    });
    if (isWebRTCOpen.value) {
      console.warn('[WebRTC] Already in a call, ignoring offer');
      return;
    }

    const user = getUserById(fromUserId);
    if (!user) {
      console.error('[WebRTC] Offer received from unknown user', fromUserId);
      return;
    }

    webRTCUser.value = user;
    isWebRTCIncoming.value = true;
    isWebRTCOpen.value = true;
    isWebRTCModalVisible.value = true;
    webRTCRoomId.value = roomId;
    webRTCTopicId.value = topicId;

    // Store the offer temporarily
    (window as any)._pendingWebRTCOffer = offer;

    playRingtone();
  };

  const acceptWebRTCCall = async () => {
    console.log('[WebRTC] Accepting call...');
    if (!isWebRTCIncoming.value || !webRTCRoomId.value || !webRTCUser.value) {
      console.error('[WebRTC] Cannot accept call: invalid state', {
        incoming: isWebRTCIncoming.value,
        room: webRTCRoomId.value,
        user: !!webRTCUser.value
      });
      return;
    }

    stopRingtone();
    isWebRTCIncoming.value = false;

    try {
      console.log('[WebRTC] Requesting local media...');
      localStream.value = await getMediaStream();

      console.log('[WebRTC] Local media obtained, creating PC...');
      const pc = createPeerConnection(webRTCUser.value.id);
      const offer = (window as any)._pendingWebRTCOffer;

      console.log('[WebRTC] Setting remote description (Offer)...');
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      console.log('[WebRTC] Creating and setting answer...');
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const sdk = getChatSDK();
      if (sdk) {
        console.log('[WebRTC] Sending answer to', webRTCUser.value.id);
        sdk.sendWebSocketEvent(WebSocketEventType.WEBRTC_ANSWER, {
          toUserId: webRTCUser.value.id,
          answer,
          roomId: webRTCRoomId.value!,
          topicId: webRTCTopicId.value!
        });
      }

      // Add any pending ICE candidates
      console.log(
        `[WebRTC] Processing ${pendingIceCandidates.value.length} pending candidates`
      );
      while (pendingIceCandidates.value.length > 0) {
        const candidate = pendingIceCandidates.value.shift();
        if (candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (err) {
      console.error('[WebRTC] Failed to accept call:', err);
      cleanup();
    }
  };

  const handleAnswer = async (
    answer: RTCSessionDescriptionInit,
    roomId: string,
    topicId: string
  ) => {
    console.log('[WebRTC] Received answer', { roomId, topicId });
    if (peerConnection.value) {
      // Ensure we are in the correct room/topic
      if (webRTCRoomId.value === roomId && webRTCTopicId.value === topicId) {
        console.log('[WebRTC] Setting remote description (Answer)...');
        await peerConnection.value.setRemoteDescription(
          new RTCSessionDescription(answer)
        );
        isWebRTCCalling.value = false;

        // Add any pending ICE candidates
        console.log(
          `[WebRTC] Processing ${pendingIceCandidates.value.length} pending candidates`
        );
        while (pendingIceCandidates.value.length > 0) {
          const candidate = pendingIceCandidates.value.shift();
          if (candidate)
            await peerConnection.value.addIceCandidate(
              new RTCIceCandidate(candidate)
            );
        }
      } else {
        console.warn('[WebRTC] Answer room/topic mismatch');
      }
    } else {
      console.warn('[WebRTC] Received answer but no peer connection exists');
    }
  };

  const handleIceCandidate = async (
    candidate: RTCIceCandidateInit,
    roomId: string,
    topicId: string
  ) => {
    console.log('[WebRTC] Received ICE candidate', { roomId, topicId });
    // Only process if it belongs to current call
    if (webRTCRoomId.value !== roomId || webRTCTopicId.value !== topicId) {
      console.warn('[WebRTC] ICE candidate ignored: room/topic mismatch');
      return;
    }

    if (peerConnection.value && peerConnection.value.remoteDescription) {
      try {
        await peerConnection.value.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
        console.log('[WebRTC] Added ICE candidate');
      } catch (err) {
        console.error('[WebRTC] Failed to add ICE candidate:', err);
      }
    } else {
      console.log(
        '[WebRTC] Queuing ICE candidate (PC or RemoteDesc not ready)'
      );
      pendingIceCandidates.value.push(candidate);
    }
  };

  const cleanup = () => {
    stopTimer();
    stopRingtone();
    if (localStream.value) {
      localStream.value.getTracks().forEach(track => track.stop());
      localStream.value = null;
    }
    if (remoteStream.value) {
      remoteStream.value.getTracks().forEach(track => track.stop());
      remoteStream.value = null;
    }
    if (peerConnection.value) {
      peerConnection.value.close();
      peerConnection.value = null;
    }
    isWebRTCOpen.value = false;
    isWebRTCIncoming.value = false;
    isWebRTCCalling.value = false;
    isWebRTCModalVisible.value = false;
    webRTCUser.value = null;
    webRTCRoomId.value = null;
    webRTCTopicId.value = null;
    pendingIceCandidates.value = [];
    delete (window as any)._pendingWebRTCOffer;
  };

  const endWebRTCCall = () => {
    const sdk = getChatSDK();
    const me = getAuthUser();
    if (
      sdk &&
      me &&
      webRTCRoomId.value &&
      webRTCTopicId.value &&
      webRTCUser.value
    ) {
      sdk.sendWebSocketEvent(WebSocketEventType.END_CALL, {
        roomId: webRTCRoomId.value,
        userId: me.id,
        topicId: webRTCTopicId.value
      });
    }
    cleanup();
  };

  return {
    isWebRTCOpen,
    isWebRTCIncoming,
    isWebRTCCalling,
    webRTCUser,
    webRTCState,
    localStream,
    remoteStream,
    formattedTime,
    startWebRTCCall,
    acceptWebRTCCall,
    endWebRTCCall,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    cleanup
  };
}

const {
  startWebRTCCall,
  acceptWebRTCCall,
  endWebRTCCall,
  handleOffer,
  handleAnswer,
  handleIceCandidate,
  cleanup
} = useWebRTC();

export {
  isWebRTCOpen,
  isWebRTCIncoming,
  isWebRTCCalling,
  isWebRTCModalVisible,
  webRTCUser,
  webRTCState,
  localStream,
  remoteStream,
  formattedTime,
  startWebRTCCall,
  acceptWebRTCCall,
  endWebRTCCall,
  handleOffer,
  handleAnswer,
  handleIceCandidate,
  cleanup
};
