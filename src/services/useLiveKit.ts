import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  LocalVideoTrack,
  RemoteParticipant,
  Room,
  RoomEvent,
  Track
} from 'livekit-client';
import { computed, reactive, ref } from 'vue';
import type { IUser } from '../components/interfaces/interfaces';
import { getAuthUser } from '../composables/useAuth';
import { showErrorNotification } from '../composables/useNotifications';
import { AudioOutput } from './useAudioOutput';
import {
  playNativeCallRingtone,
  stopNativeCallRingtone
} from './useNotificationSoundPolicy';
import { endAllCallKits, showIncomingCallKit } from './useCallKit';
import { getChatSDK } from './useChat';
import { WebSocketEventType } from './useChatSDK/websocketEvents';
import { TopicType } from './useChatSDK/types';
import { useTopics } from '../composables/useTopics';

type LiveKitCallStatus = {
  active: boolean;
  topicId?: string | null;
  startTime?: number | null;
  roomReady?: boolean;
  participantCount?: number;
  wasAnswered?: boolean;
};

type ActiveGroupCallEntry = {
  roomId: string;
  topicId: string;
  caller?: IUser | null;
  startTime?: number | null;
};

type ParticipantMediaState = {
  identity: string;
  name: string;
  videoStream: MediaStream | null;
  cameraStream: MediaStream | null;
  screenShareStream: MediaStream | null;
  audioStream: MediaStream | null;
  isVideoActive: boolean;
  isScreenShareActive: boolean;
  isHandRaised: boolean;
  isSpeaking: boolean;
  isMicActive: boolean;
};

type StreamCacheEntry = {
  trackId: string;
  track: MediaStreamTrack;
  stream: MediaStream;
};

type CallEndReason = 'busy';

type CallSocketAck = {
  accepted?: boolean;
  roomId?: string | null;
  topicId?: string | null;
  startTime?: number | null;
  isNewCall?: boolean;
};

const open = ref(false);
const isIncoming = ref(false);
const isCalling = ref(false);
const user = ref<IUser | null>(null);
const roomId = ref<string | null>(null);
const topicId = ref<string | null>(null);
const callStartedAt = ref<number | null>(null);
const timerSeconds = ref(0);
const isModalVisible = ref(false);
const isRemoteVideoActive = ref(false);
const localVideoStream = ref<MediaStream | null>(null);
const localScreenShareStream = ref<MediaStream | null>(null);
const handRaisedParticipants = ref<Record<string, boolean>>({});
const remoteParticipants = ref<ParticipantMediaState[]>([]);
const callStatusNotice = ref<string | null>(null);
const pendingEndCallRoomId = ref<string | null>(null);
const pendingEndCallTopicId = ref<string | null>(null);
const activeGroupCalls = ref<Record<string, ActiveGroupCallEntry>>({});
const invitedGroupCall = ref<{
  roomId: string;
  topicId: string;
  inviteToken: string;
  title: string;
  avatarUrl?: string | null;
  startTime?: number | null;
  participantCount: number;
  members: IUser[];
  isJoinAvailable: boolean;
} | null>(null);

const state = reactive({
  isMicActive: false,
  isVideoActive: false,
  isScreenSharingActive: false,
  isSpeakerActive: false,
  isFullScreen: false,
  isHandRaised: false
});

const HAND_RAISE_TOPIC = 'group-call-hand-raise';

let room: Room | null = null;
let timerInterval: ReturnType<typeof setInterval> | null = null;
let dialingTimeout: ReturnType<typeof setTimeout> | null = null;
let ringtoneAudio: HTMLAudioElement | null = null;
let dialingAudio: HTMLAudioElement | null = null;
let isAcceptingLocally = false;
let localAcceptRoomId: string | null = null;
let localAcceptTopicId: string | null = null;
let connectPromise: Promise<void> | null = null;
let connectAttemptId = 0;
let currentCameraFacingMode: 'user' | 'environment' = 'user';
let shouldEndCallOnConnectFailure = false;
const localTrackStreamCache = new Map<string, StreamCacheEntry>();
const remoteTrackStreamCache = new Map<string, StreamCacheEntry>();
let pendingEndCallRetryTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingEndCallFinalizeTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingNativeCallActionTimeout: ReturnType<typeof setTimeout> | null = null;
let callStatusNoticeTimeout: ReturnType<typeof setTimeout> | null = null;

const MAX_NATIVE_CALL_ACTION_RETRIES = 120;
const NATIVE_CALL_ACTION_RETRY_DELAY_MS = 500;
const DISMISSED_INCOMING_CALL_TTL_MS = 15000;
const CALL_STATUS_NOTICE_CLOSE_DELAY_MS = 3000;
const dismissedIncomingCallRooms = new Map<string, number>();
const dismissedIncomingCallTopics = new Map<string, number>();

const createRoomId = () => `livekit-${Math.random().toString(36).slice(2, 10)}`;

const resolveCallTargetTopicId = (
  incomingRoomId?: string,
  incomingTopicId?: string
) => incomingTopicId || topicId.value || incomingRoomId || roomId.value || null;

const removePendingGroupCallEntry = (targetTopicId?: string | null) => {
  if (!targetTopicId) return;

  const nextActiveGroupCalls = { ...activeGroupCalls.value };
  delete nextActiveGroupCalls[targetTopicId];
  activeGroupCalls.value = nextActiveGroupCalls;
};

const removeInvitedGroupCallEntry = (activeRoomId?: string | null) => {
  if (!invitedGroupCall.value) return;
  if (activeRoomId && invitedGroupCall.value.roomId !== activeRoomId) return;

  invitedGroupCall.value = null;
};

const pruneDismissedIncomingCalls = () => {
  const now = Date.now();

  dismissedIncomingCallRooms.forEach((expiresAt, targetRoomId) => {
    if (expiresAt <= now) {
      dismissedIncomingCallRooms.delete(targetRoomId);
    }
  });

  dismissedIncomingCallTopics.forEach((expiresAt, targetTopicId) => {
    if (expiresAt <= now) {
      dismissedIncomingCallTopics.delete(targetTopicId);
    }
  });
};

const markIncomingCallDismissed = (
  targetRoomId?: string | null,
  targetTopicId?: string | null
) => {
  pruneDismissedIncomingCalls();
  const expiresAt = Date.now() + DISMISSED_INCOMING_CALL_TTL_MS;

  if (targetRoomId) {
    dismissedIncomingCallRooms.set(targetRoomId, expiresAt);
  }

  if (targetTopicId) {
    dismissedIncomingCallTopics.set(targetTopicId, expiresAt);
  }
};

const isIncomingCallDismissed = (
  targetRoomId?: string | null,
  targetTopicId?: string | null
) => {
  pruneDismissedIncomingCalls();

  return (
    (!!targetRoomId && dismissedIncomingCallRooms.has(targetRoomId)) ||
    (!!targetTopicId && dismissedIncomingCallTopics.has(targetTopicId))
  );
};

const clearUnavailableCallState = (
  targetRoomId?: string | null,
  targetTopicId?: string | null
) => {
  removePendingGroupCallEntry(targetTopicId);
  removeInvitedGroupCallEntry(targetRoomId);
};

const clearPendingEndCallTimers = () => {
  if (pendingEndCallRetryTimeout) {
    clearTimeout(pendingEndCallRetryTimeout);
    pendingEndCallRetryTimeout = null;
  }

  if (pendingEndCallFinalizeTimeout) {
    clearTimeout(pendingEndCallFinalizeTimeout);
    pendingEndCallFinalizeTimeout = null;
  }
};

const clearCallStatusNotice = () => {
  if (callStatusNoticeTimeout) {
    clearTimeout(callStatusNoticeTimeout);
    callStatusNoticeTimeout = null;
  }

  callStatusNotice.value = null;
};

const clearLocalAcceptState = () => {
  localAcceptRoomId = null;
  localAcceptTopicId = null;
};

const showTransientCallStatusNotice = (
  message: string,
  closeDelayMs = CALL_STATUS_NOTICE_CLOSE_DELAY_MS
) => {
  clearCallStatusNotice();
  callStatusNotice.value = message;
  clearDialingTimeout();
  stopDialingSound();
  stopRingtone();

  callStatusNoticeTimeout = setTimeout(() => {
    callStatusNoticeTimeout = null;

    if (callStatusNotice.value !== message) {
      return;
    }

    cleanup(true);
  }, closeDelayMs);
};

const resetPendingEndCallState = () => {
  clearPendingEndCallTimers();
  pendingEndCallRoomId.value = null;
  pendingEndCallTopicId.value = null;
};

const emitEndCallEvent = (
  targetRoomId?: string | null,
  targetTopicId?: string | null
) => {
  const sdk = getChatSDK();
  const me = getAuthUser();

  if (!sdk || !me || !targetRoomId || !targetTopicId) {
    return;
  }

  sdk.sendWebSocketEvent(WebSocketEventType.END_CALL, {
    roomId: targetRoomId,
    topicId: targetTopicId,
    userId: me.id
  });
};

const schedulePendingEndCallConfirmation = (
  targetRoomId?: string | null,
  targetTopicId?: string | null
) => {
  if (!targetRoomId || !targetTopicId) {
    resetPendingEndCallState();
    return;
  }

  clearPendingEndCallTimers();
  pendingEndCallRoomId.value = targetRoomId;
  pendingEndCallTopicId.value = targetTopicId;

  pendingEndCallRetryTimeout = setTimeout(() => {
    if (
      pendingEndCallRoomId.value === targetRoomId &&
      pendingEndCallTopicId.value === targetTopicId
    ) {
      emitEndCallEvent(targetRoomId, targetTopicId);
    }
  }, 1500);

  pendingEndCallFinalizeTimeout = setTimeout(() => {
    void (async () => {
      if (
        pendingEndCallRoomId.value !== targetRoomId ||
        pendingEndCallTopicId.value !== targetTopicId
      ) {
        return;
      }

      resetPendingEndCallState();

      const status = await getLiveKitCallStatus(targetRoomId, targetTopicId);
      if (!status?.active) {
        clearUnavailableCallState(targetRoomId, targetTopicId);
      }

      if (roomId.value === targetRoomId) {
        roomId.value = null;
      }
      if (topicId.value === targetTopicId) {
        topicId.value = null;
      }
    })();
  }, 2500);
};

const matchesPendingEndCall = (
  targetRoomId?: string | null,
  targetTopicId?: string | null
): boolean =>
  (!!targetRoomId && pendingEndCallRoomId.value === targetRoomId) ||
  (!!targetTopicId && pendingEndCallTopicId.value === targetTopicId);

const getLiveKitCallStatus = async (
  targetRoomId?: string | null,
  targetTopicId?: string | null
): Promise<LiveKitCallStatus | null> => {
  if (!targetRoomId) {
    return null;
  }

  const sdk = getChatSDK();
  if (!sdk) {
    return null;
  }

  const status = await sdk.getLiveKitCallStatus(targetRoomId);
  const isAvailable = status?.active === true;

  if (!isAvailable) {
    clearUnavailableCallState(targetRoomId, targetTopicId);
    return null;
  }

  return status;
};

const isLiveKitCallAvailable = async (
  targetRoomId?: string | null,
  targetTopicId?: string | null
) => {
  const status = await getLiveKitCallStatus(targetRoomId, targetTopicId);
  return status?.active === true;
};

const scheduleNativeCallActionRetry = (
  action: 'accept' | 'decline',
  incomingRoomId?: string,
  incomingTopicId?: string,
  attempt = 0
) => {
  if (attempt >= MAX_NATIVE_CALL_ACTION_RETRIES) {
    console.warn(
      '[LiveKit] Native call action timed out before chat became ready.',
      {
        action,
        roomId: incomingRoomId,
        topicId: incomingTopicId
      }
    );
    return;
  }

  if (pendingNativeCallActionTimeout) {
    clearTimeout(pendingNativeCallActionTimeout);
  }

  pendingNativeCallActionTimeout = setTimeout(() => {
    pendingNativeCallActionTimeout = null;
    void handleNativeCallAction(
      action,
      incomingRoomId,
      incomingTopicId,
      attempt + 1
    );
  }, NATIVE_CALL_ACTION_RETRY_DELAY_MS);
};

const restoreGroupCallEntryIfStillActive = (
  targetRoomId?: string | null,
  targetTopicId?: string | null,
  caller?: IUser | null,
  startTime?: number | null
) => {
  if (!targetRoomId || !targetTopicId) {
    return;
  }

  setTimeout(() => {
    void (async () => {
      const status = await getLiveKitCallStatus(targetRoomId, targetTopicId);
      const hasOtherParticipants = (status?.participantCount ?? 0) > 0;

      if (!status?.active || !hasOtherParticipants) {
        clearUnavailableCallState(targetRoomId, targetTopicId);
        return;
      }

      activeGroupCalls.value = {
        ...activeGroupCalls.value,
        [targetTopicId]: {
          roomId: targetRoomId,
          topicId: targetTopicId,
          caller,
          startTime: startTime ?? status.startTime ?? null
        }
      };
    })();
  }, 3000);
};

const formatTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const getInviteParamsFromUrl = () => {
  if (typeof window === 'undefined') return null;

  const url = new URL(window.location.href);
  const inviteToken = url.searchParams.get('callInvite');
  const activeRoomId = url.searchParams.get('callRoom');

  if (!inviteToken || !activeRoomId) {
    return null;
  }

  return {
    roomId: activeRoomId,
    inviteToken
  };
};

const clearInviteParamsFromUrl = () => {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  url.searchParams.delete('callInvite');
  url.searchParams.delete('callRoom');
  window.history.replaceState({}, document.title, url.toString());
};

const formattedTime = computed(() => formatTime(timerSeconds.value));

const syncTimerValue = () => {
  if (!callStartedAt.value) {
    timerSeconds.value = 0;
    return;
  }

  timerSeconds.value = Math.max(
    0,
    Math.floor((Date.now() - callStartedAt.value) / 1000)
  );
};

const setCallStartedAt = (startTime?: number | null) => {
  callStartedAt.value =
    typeof startTime === 'number' && Number.isFinite(startTime)
      ? startTime
      : null;
  syncTimerValue();
};

const startTimer = (startTime: number | null = callStartedAt.value) => {
  if (typeof startTime === 'number' && Number.isFinite(startTime)) {
    callStartedAt.value = startTime;
  }

  syncTimerValue();

  if (timerInterval) return;
  timerInterval = setInterval(() => {
    syncTimerValue();
  }, 1000);
};

const stopTimer = () => {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  setCallStartedAt(null);
};

const playRingtone = () => {
  if (Capacitor.isNativePlatform()) {
    void playNativeCallRingtone();
    return;
  }

  if (ringtoneAudio) return;
  ringtoneAudio = new Audio('/audio/ringtone.mp3');
  ringtoneAudio.loop = true;
  ringtoneAudio
    .play()
    .catch(err => console.warn('[LiveKit] Ringtone failed:', err));
};

const stopRingtone = () => {
  if (Capacitor.isNativePlatform()) {
    void stopNativeCallRingtone();
  }

  if (!ringtoneAudio) return;
  ringtoneAudio.pause();
  ringtoneAudio = null;
};

const playDialingSound = () => {
  if (dialingAudio) return;
  dialingAudio = new Audio('/audio/dialing.mp3');
  dialingAudio.loop = true;
  setTimeout(() => {
    dialingAudio
      ?.play()
      .catch(err => console.warn('[LiveKit] Dialing failed:', err));
  }, 1200);
};

const stopDialingSound = () => {
  if (!dialingAudio) return;
  dialingAudio.pause();
  dialingAudio = null;
};

const clearDialingTimeout = () => {
  if (dialingTimeout) {
    clearTimeout(dialingTimeout);
    dialingTimeout = null;
  }
};

const stopTrackPublication = (
  publication?: {
    track?: { mediaStreamTrack?: MediaStreamTrack | null } | null;
  } | null
) => {
  const mediaStreamTrack = publication?.track?.mediaStreamTrack;
  if (!mediaStreamTrack) return;

  mediaStreamTrack.onended = null;
  mediaStreamTrack.stop();
};

const stopMediaStream = (stream?: MediaStream | null) => {
  stream?.getTracks().forEach(track => {
    track.onended = null;
    track.stop();
  });
};

const getCachedSingleTrackStream = (
  cache: Map<string, StreamCacheEntry>,
  cacheKey: string,
  mediaStreamTrack?: MediaStreamTrack | null
) => {
  if (!mediaStreamTrack || mediaStreamTrack.readyState !== 'live') {
    cache.delete(cacheKey);
    return null;
  }

  const cachedStream = cache.get(cacheKey);
  if (
    cachedStream &&
    cachedStream.trackId === mediaStreamTrack.id &&
    cachedStream.track === mediaStreamTrack
  ) {
    return cachedStream.stream;
  }

  const stream = new MediaStream([mediaStreamTrack]);
  cache.set(cacheKey, {
    trackId: mediaStreamTrack.id,
    track: mediaStreamTrack,
    stream
  });

  return stream;
};

const clearTrackStreamCaches = () => {
  localTrackStreamCache.clear();
  remoteTrackStreamCache.clear();
};

const buildRemoteStreamCacheKey = (
  participantIdentity: string,
  kind: 'video' | 'camera' | 'screen' | 'audio'
) => `${participantIdentity}:${kind}`;

const pruneRemoteTrackStreamCache = (activeParticipantIds: string[]) => {
  const activeParticipantIdSet = new Set(activeParticipantIds);

  Array.from(remoteTrackStreamCache.keys()).forEach(cacheKey => {
    const [participantIdentity] = cacheKey.split(':');

    if (!activeParticipantIdSet.has(participantIdentity)) {
      remoteTrackStreamCache.delete(cacheKey);
    }
  });
};

const stopLocalMediaTracks = () => {
  room?.localParticipant.audioTrackPublications.forEach(publication => {
    stopTrackPublication(publication);
  });

  room?.localParticipant.videoTrackPublications.forEach(publication => {
    stopTrackPublication(publication);
  });

  stopMediaStream(localVideoStream.value);
  stopMediaStream(localScreenShareStream.value);
  localVideoStream.value = null;
  localScreenShareStream.value = null;
};

const syncLocalTrackState = () => {
  if (!room) {
    localTrackStreamCache.clear();
    localVideoStream.value = null;
    localScreenShareStream.value = null;
    return;
  }

  const localVideoPublication = Array.from(
    room.localParticipant.videoTrackPublications.values()
  ).find(publication => publication.source === Track.Source.Camera);
  const localScreenSharePublication = Array.from(
    room.localParticipant.videoTrackPublications.values()
  ).find(publication => publication.source === Track.Source.ScreenShare);

  const localVideoTrack = localVideoPublication?.track;
  const localScreenTrack = localScreenSharePublication?.track;

  if (localScreenTrack?.mediaStreamTrack) {
    localScreenTrack.mediaStreamTrack.onended = () => {
      if (state.isScreenSharingActive) {
        void toggleScreenShare();
      }
    };
  }

  localVideoStream.value = getCachedSingleTrackStream(
    localTrackStreamCache,
    'local-camera',
    localVideoTrack?.mediaStreamTrack
  );
  localScreenShareStream.value = getCachedSingleTrackStream(
    localTrackStreamCache,
    'local-screen-share',
    localScreenTrack?.mediaStreamTrack
  );
};

const getActiveRemoteVideoPublication = (
  remoteParticipant: RemoteParticipant,
  source: Track.Source.Camera | Track.Source.ScreenShare
) =>
  Array.from(remoteParticipant.videoTrackPublications.values()).find(
    publication => {
      const mediaTrack = publication.track?.mediaStreamTrack;

      return (
        !!mediaTrack &&
        mediaTrack.readyState === 'live' &&
        !publication.isMuted &&
        publication.source === source
      );
    }
  );

const getActiveRemoteAudioPublication = (
  remoteParticipant: RemoteParticipant
) =>
  Array.from(remoteParticipant.audioTrackPublications.values()).find(
    publication => {
      const mediaTrack = publication.track?.mediaStreamTrack;

      return (
        !!mediaTrack &&
        mediaTrack.readyState === 'live' &&
        !publication.isMuted &&
        publication.source === Track.Source.Microphone
      );
    }
  );

const buildRemoteParticipantState = (
  remoteParticipant: RemoteParticipant
): ParticipantMediaState => {
  const cameraPublication = getActiveRemoteVideoPublication(
    remoteParticipant,
    Track.Source.Camera
  );
  const screenSharePublication = getActiveRemoteVideoPublication(
    remoteParticipant,
    Track.Source.ScreenShare
  );
  const audioPublication = getActiveRemoteAudioPublication(remoteParticipant);
  const preferredVideoPublication = screenSharePublication || cameraPublication;

  return {
    identity: remoteParticipant.identity,
    name: remoteParticipant.name || remoteParticipant.identity,
    videoStream: getCachedSingleTrackStream(
      remoteTrackStreamCache,
      buildRemoteStreamCacheKey(remoteParticipant.identity, 'video'),
      preferredVideoPublication?.track?.mediaStreamTrack
    ),
    cameraStream: getCachedSingleTrackStream(
      remoteTrackStreamCache,
      buildRemoteStreamCacheKey(remoteParticipant.identity, 'camera'),
      cameraPublication?.track?.mediaStreamTrack
    ),
    screenShareStream: getCachedSingleTrackStream(
      remoteTrackStreamCache,
      buildRemoteStreamCacheKey(remoteParticipant.identity, 'screen'),
      screenSharePublication?.track?.mediaStreamTrack
    ),
    audioStream: getCachedSingleTrackStream(
      remoteTrackStreamCache,
      buildRemoteStreamCacheKey(remoteParticipant.identity, 'audio'),
      audioPublication?.track?.mediaStreamTrack
    ),
    isVideoActive: !!preferredVideoPublication?.track?.mediaStreamTrack,
    isScreenShareActive: !!screenSharePublication?.track?.mediaStreamTrack,
    isHandRaised: !!handRaisedParticipants.value[remoteParticipant.identity],
    isSpeaking: !!remoteParticipant.isSpeaking,
    isMicActive: !!audioPublication?.track?.mediaStreamTrack
  };
};

const syncRemoteParticipantSpeakingState = () => {
  if (!room || !remoteParticipants.value.length) {
    return;
  }

  const speakingParticipantIds = new Set(
    Array.from(room.remoteParticipants.values())
      .filter(participant => participant.isSpeaking)
      .map(participant => participant.identity)
  );

  remoteParticipants.value = remoteParticipants.value.map(participant => ({
    ...participant,
    isSpeaking: speakingParticipantIds.has(participant.identity)
  }));
};

const syncRemoteParticipantState = () => {
  const activeRoom = room;
  if (!activeRoom) {
    remoteTrackStreamCache.clear();
    remoteParticipants.value = [];
    isRemoteVideoActive.value = false;
    return;
  }

  const nextRemoteParticipants = Array.from(
    activeRoom.remoteParticipants.values()
  ).map(buildRemoteParticipantState);

  pruneRemoteTrackStreamCache(
    nextRemoteParticipants.map(participant => participant.identity)
  );
  remoteParticipants.value = nextRemoteParticipants;

  isRemoteVideoActive.value = remoteParticipants.value.some(
    participant => participant.isVideoActive
  );
};

const publishHandRaiseState = async (isRaised: boolean) => {
  if (!room) return;

  const payload = new TextEncoder().encode(
    JSON.stringify({
      type: HAND_RAISE_TOPIC,
      isRaised
    })
  );

  await room.localParticipant.publishData(payload, {
    reliable: true,
    topic: HAND_RAISE_TOPIC
  });
};

const handleHandRaiseData = (
  payload: Uint8Array,
  participant?: RemoteParticipant,
  topic?: string
) => {
  if (!participant || topic !== HAND_RAISE_TOPIC) return;

  try {
    const parsedPayload = JSON.parse(new TextDecoder().decode(payload)) as {
      type?: string;
      isRaised?: boolean;
    };

    if (parsedPayload.type !== HAND_RAISE_TOPIC) return;

    handRaisedParticipants.value = {
      ...handRaisedParticipants.value,
      [participant.identity]: !!parsedPayload.isRaised
    };
    syncRemoteParticipantState();
  } catch (error) {
    console.warn('[LiveKit] Failed to parse hand raise event:', error);
  }
};

const activeScreenShare = computed(() => {
  const remoteScreenShareParticipant = remoteParticipants.value.find(
    participant =>
      participant.isScreenShareActive &&
      participant.screenShareStream &&
      participant.screenShareStream
        .getVideoTracks()
        .some(track => track.readyState === 'live')
  );

  if (!remoteScreenShareParticipant?.screenShareStream) return null;

  return {
    identity: remoteScreenShareParticipant.identity,
    name: remoteScreenShareParticipant.name,
    stream: remoteScreenShareParticipant.screenShareStream,
    isLocal: false
  };
});

const enforceSingleScreenShare = async () => {
  if (!room || !state.isScreenSharingActive) return;

  const remoteScreenShareParticipant = remoteParticipants.value.find(
    participant => participant.isScreenShareActive
  );

  if (!remoteScreenShareParticipant) return;

  state.isScreenSharingActive = false;
  await room.localParticipant.setScreenShareEnabled(false);
  syncLocalTrackState();
};

const ensureLocalMicrophoneState = async (activeRoom: Room | null = room) => {
  if (!activeRoom || !state.isMicActive) return;

  const microphonePublication = Array.from(
    activeRoom.localParticipant.audioTrackPublications.values()
  ).find(publication => publication.source === Track.Source.Microphone);
  const microphoneTrack = microphonePublication?.track?.mediaStreamTrack;
  const hasLiveMicrophoneTrack =
    !!microphoneTrack &&
    microphoneTrack.readyState === 'live' &&
    !microphonePublication?.isMuted;

  if (hasLiveMicrophoneTrack) {
    return;
  }

  await activeRoom.localParticipant.setMicrophoneEnabled(true);
};

const syncConnectionState = (activeRoom: Room) => {
  const hasRemoteParticipant = activeRoom.remoteParticipants.size > 0;

  isIncoming.value = false;

  if (callStartedAt.value) {
    startTimer();
  } else {
    stopTimer();
  }

  if (hasRemoteParticipant) {
    isCalling.value = false;
    stopDialingSound();
    stopRingtone();
    return;
  }

  if (open.value) {
    isCalling.value = true;
  }
};

const setupRoomListeners = (activeRoom: Room) => {
  activeRoom
    .on(RoomEvent.TrackPublished, () => {
      syncRemoteParticipantState();
      syncConnectionState(activeRoom);
      void enforceSingleScreenShare();
    })
    .on(RoomEvent.TrackUnpublished, () => {
      syncRemoteParticipantState();
      syncConnectionState(activeRoom);
    })
    .on(RoomEvent.TrackSubscribed, () => {
      syncRemoteParticipantState();
      syncConnectionState(activeRoom);
      void enforceSingleScreenShare();
    })
    .on(RoomEvent.TrackUnsubscribed, () => {
      syncRemoteParticipantState();
      syncConnectionState(activeRoom);
    })
    .on(RoomEvent.TrackMuted, () => {
      syncLocalTrackState();
      syncRemoteParticipantState();
      void enforceSingleScreenShare();
    })
    .on(RoomEvent.TrackUnmuted, () => {
      syncLocalTrackState();
      syncRemoteParticipantState();
      void enforceSingleScreenShare();
    })
    .on(RoomEvent.ActiveSpeakersChanged, () => {
      syncRemoteParticipantSpeakingState();
    })
    .on(RoomEvent.ParticipantConnected, () => {
      syncRemoteParticipantState();
      syncConnectionState(activeRoom);
      if (state.isHandRaised) {
        void publishHandRaiseState(true);
      }
    })
    .on(RoomEvent.ParticipantDisconnected, participant => {
      const nextHandRaisedParticipants = { ...handRaisedParticipants.value };
      delete nextHandRaisedParticipants[participant.identity];
      handRaisedParticipants.value = nextHandRaisedParticipants;
      syncRemoteParticipantState();
      syncConnectionState(activeRoom);
    })
    .on(RoomEvent.LocalTrackPublished, publication => {
      syncLocalTrackState();
      if (
        publication.source === Track.Source.ScreenShare ||
        publication.source === Track.Source.ScreenShareAudio
      ) {
        void ensureLocalMicrophoneState(activeRoom);
      }
    })
    .on(RoomEvent.LocalTrackUnpublished, publication => {
      syncLocalTrackState();
      if (
        publication.source === Track.Source.ScreenShare ||
        publication.source === Track.Source.ScreenShareAudio
      ) {
        void ensureLocalMicrophoneState(activeRoom);
      }
    })
    .on(RoomEvent.DataReceived, (payload, participant, _, topic) => {
      handleHandRaiseData(payload, participant, topic);
    })
    .on(RoomEvent.Reconnecting, () => {
      syncLocalTrackState();
      syncRemoteParticipantState();
      syncConnectionState(activeRoom);
    })
    .on(RoomEvent.Reconnected, () => {
      syncLocalTrackState();
      syncRemoteParticipantState();
      syncConnectionState(activeRoom);
      void ensureLocalMicrophoneState(activeRoom);
      void enforceSingleScreenShare();
    })
    .on(RoomEvent.Disconnected, () => {
      if (matchesPendingEndCall(roomId.value, topicId.value)) {
        return;
      }

      cleanup(false);
    });
};

const getToken = async (activeRoomId: string) => {
  const sdk = getChatSDK();
  if (!sdk) return null;

  if (
    invitedGroupCall.value?.roomId === activeRoomId &&
    invitedGroupCall.value.inviteToken
  ) {
    return sdk.getInviteLiveKitToken(
      activeRoomId,
      invitedGroupCall.value.inviteToken
    );
  }

  return sdk.getLiveKitToken(activeRoomId);
};

const getConnectErrorMessage = (error: unknown) => {
  const errorMessage =
    error instanceof Error ? error.message.toLowerCase() : String(error);

  if (
    errorMessage.includes('call is no longer active') ||
    errorMessage.includes('failed to get livekit token')
  ) {
    return 'Звонок уже завершен.';
  }

  if (errorMessage.includes('429')) {
    return 'Не удалось подключиться к звонку из-за ограничения запросов. Попробуйте еще раз через несколько секунд.';
  }

  return 'Не удалось подключиться к звонку. Попробуйте еще раз.';
};

const isExpectedConnectAbort = (
  error: unknown,
  targetRoomId?: string | null,
  targetTopicId?: string | null,
  currentAttemptId?: number,
  activeRoom?: Room | null
) => {
  const errorMessage =
    error instanceof Error ? error.message.toLowerCase() : String(error);

  return (
    errorMessage.includes('client initiated disconnect') ||
    (!!currentAttemptId && currentAttemptId !== connectAttemptId) ||
    (!!activeRoom && room !== activeRoom) ||
    matchesPendingEndCall(targetRoomId, targetTopicId) ||
    isIncomingCallDismissed(targetRoomId, targetTopicId)
  );
};

const connectToRoom = async () => {
  if (connectPromise) {
    return connectPromise;
  }

  const currentAttemptId = ++connectAttemptId;

  connectPromise = (async () => {
    const sdk = getChatSDK();
    const me = getAuthUser();
    const activeRoomId = roomId.value;
    const activeTopicId = topicId.value;
    const config = sdk?.getConfig();

    if (!sdk || !me || !activeRoomId || !config?.CHAT_LIVEKIT_URL) {
      throw new Error('LiveKit config is incomplete');
    }

    const token = await getToken(activeRoomId);
    if (!token) {
      const callStatus = await sdk.getLiveKitCallStatus(activeRoomId);
      if (!callStatus?.active || callStatus.topicId !== activeTopicId) {
        throw new Error('Call is no longer active');
      }

      throw new Error('Failed to get LiveKit token');
    }

    room?.disconnect();
    const nextRoom = new Room({
      adaptiveStream: true,
      dynacast: true
    });
    room = nextRoom;

    setupRoomListeners(nextRoom);

    try {
      await nextRoom.connect(config.CHAT_LIVEKIT_URL, token);
    } catch (error) {
      const isExpectedAbort = isExpectedConnectAbort(
        error,
        activeRoomId,
        activeTopicId,
        currentAttemptId,
        nextRoom
      );

      if (room === nextRoom) {
        room = null;
      }

      if (isExpectedAbort) {
        return;
      }

      if (
        shouldEndCallOnConnectFailure &&
        sdk &&
        me &&
        activeRoomId &&
        activeTopicId
      ) {
        sdk.sendWebSocketEvent(WebSocketEventType.END_CALL, {
          roomId: activeRoomId,
          topicId: activeTopicId,
          userId: me.id
        });
      }

      cleanup(false);
      showErrorNotification(getConnectErrorMessage(error));
      throw error;
    }

    if (currentAttemptId !== connectAttemptId || room !== nextRoom) {
      nextRoom.disconnect();
      return;
    }

    await nextRoom.localParticipant.setMicrophoneEnabled(state.isMicActive);
    if (state.isVideoActive) {
      await nextRoom.localParticipant.setCameraEnabled(true);
    }
    if (state.isScreenSharingActive) {
      await nextRoom.localParticipant.setScreenShareEnabled(true);
      await ensureLocalMicrophoneState(nextRoom);
    }

    syncLocalTrackState();
    syncRemoteParticipantState();
    syncConnectionState(nextRoom);
    shouldEndCallOnConnectFailure = false;
    stopDialingSound();
    stopRingtone();
  })().finally(() => {
    if (currentAttemptId === connectAttemptId) {
      connectPromise = null;
    }
  });

  return connectPromise;
};

const resetMediaState = () => {
  clearTrackStreamCaches();
  currentCameraFacingMode = 'user';
  localVideoStream.value = null;
  localScreenShareStream.value = null;
  remoteParticipants.value = [];
  handRaisedParticipants.value = {};
  isRemoteVideoActive.value = false;
  state.isMicActive = false;
  state.isVideoActive = false;
  state.isScreenSharingActive = false;
  state.isSpeakerActive = false;
  state.isFullScreen = false;
  state.isHandRaised = false;
};

const applyCallSocketAck = (
  ack?: CallSocketAck | null,
  fallback?: {
    roomId?: string | null;
    topicId?: string | null;
    startTime?: number | null;
    isNewCall?: boolean;
  }
) => {
  const resolvedRoomId = ack?.roomId ?? fallback?.roomId ?? null;
  const resolvedTopicId = ack?.topicId ?? fallback?.topicId ?? null;
  const resolvedStartTime = ack?.startTime ?? fallback?.startTime ?? null;

  if (resolvedRoomId) {
    roomId.value = resolvedRoomId;
  }

  if (resolvedTopicId) {
    topicId.value = resolvedTopicId;
  }

  if (resolvedStartTime) {
    setCallStartedAt(resolvedStartTime);
  }

  if (typeof ack?.isNewCall === 'boolean') {
    shouldEndCallOnConnectFailure = ack.isNewCall;
  } else if (typeof fallback?.isNewCall === 'boolean') {
    shouldEndCallOnConnectFailure = fallback.isNewCall;
  }
};

export const startLiveKitCall = async (
  targetUser: IUser,
  currentTopicId: string
) => {
  if (open.value) return;

  const sdk = getChatSDK();
  const me = getAuthUser();
  if (!sdk || !me) return;

  clearCallStatusNotice();
  user.value = targetUser;
  topicId.value = currentTopicId;
  roomId.value = createRoomId();
  setCallStartedAt(Date.now());
  shouldEndCallOnConnectFailure = true;
  open.value = true;
  isCalling.value = true;
  isModalVisible.value = true;
  playDialingSound();

  const startAck = await sdk.sendWebSocketEventWithAck<
    WebSocketEventType.START_CALL,
    CallSocketAck
  >(WebSocketEventType.START_CALL, {
    roomId: roomId.value,
    topicId: currentTopicId,
    userId: me.id
  });

  applyCallSocketAck(startAck, {
    roomId: roomId.value,
    topicId: currentTopicId,
    startTime: callStartedAt.value,
    isNewCall: true
  });

  if (startAck?.accepted === false) {
    return;
  }

  await connectToRoom();

  clearDialingTimeout();
  dialingTimeout = setTimeout(() => {
    if (isCalling.value) {
      leaveCall();
    }
  }, 20000);
};

export const startLiveKitGroupCall = async (currentTopicId: string) => {
  if (open.value) return;

  const existingGroupCall = activeGroupCalls.value[currentTopicId];
  if (existingGroupCall) {
    const isAvailable = await isLiveKitCallAvailable(
      existingGroupCall.roomId,
      existingGroupCall.topicId
    );

    if (isAvailable) {
      return;
    }
  }

  const sdk = getChatSDK();
  const me = getAuthUser();
  if (!sdk || !me) return;

  clearCallStatusNotice();
  const activeRoomId = createRoomId();
  user.value = me as any;
  topicId.value = currentTopicId;
  roomId.value = activeRoomId;
  setCallStartedAt(Date.now());
  shouldEndCallOnConnectFailure = true;
  open.value = true;
  isIncoming.value = false;
  isCalling.value = true;
  isModalVisible.value = true;

  const startAck = await sdk.sendWebSocketEventWithAck<
    WebSocketEventType.START_CALL,
    CallSocketAck
  >(WebSocketEventType.START_CALL, {
    roomId: activeRoomId,
    topicId: currentTopicId,
    userId: me.id
  });

  applyCallSocketAck(startAck, {
    roomId: activeRoomId,
    topicId: currentTopicId,
    startTime: callStartedAt.value,
    isNewCall: true
  });

  if (startAck?.accepted === false) {
    return;
  }

  await connectToRoom();
};

export const receiveIncomingCall = async (
  targetUser: IUser | null,
  incomingRoomId: string,
  incomingTopicId: string,
  incomingTopicType?: TopicType | string | null,
  incomingStartTime?: number | null
) => {
  clearCallStatusNotice();

  if (isIncomingCallDismissed(incomingRoomId, incomingTopicId)) {
    return false;
  }

  const topic = useTopics().getSelectedTopic(incomingTopicId) as any;
  const resolvedTopicType = incomingTopicType || topic?.type;

  const callStatus = await getLiveKitCallStatus(
    incomingRoomId,
    incomingTopicId
  );

  if (!callStatus?.active) {
    return false;
  }

  if (isIncomingCallDismissed(incomingRoomId, incomingTopicId)) {
    return false;
  }

  if (resolvedTopicType !== TopicType.Group && callStatus.wasAnswered) {
    markIncomingCallDismissed(incomingRoomId, incomingTopicId);
    return false;
  }

  const resolvedStartTime = incomingStartTime ?? callStatus.startTime ?? null;

  if (resolvedTopicType === TopicType.Group) {
    activeGroupCalls.value = {
      ...activeGroupCalls.value,
      [incomingTopicId]: {
        roomId: incomingRoomId,
        topicId: incomingTopicId,
        caller: targetUser,
        startTime: resolvedStartTime
      }
    };
    return true;
  }

  if (!targetUser) return false;
  if (open.value) return false;

  if (Capacitor.isNativePlatform()) {
    user.value = targetUser;
    roomId.value = incomingRoomId;
    topicId.value = incomingTopicId;
    setCallStartedAt(resolvedStartTime);
    open.value = false;
    isIncoming.value = true;
    isModalVisible.value = false;
    stopRingtone();
    return true;
  }

  user.value = targetUser;
  roomId.value = incomingRoomId;
  topicId.value = incomingTopicId;
  setCallStartedAt(resolvedStartTime);
  open.value = true;
  isIncoming.value = true;
  isModalVisible.value = true;
  playRingtone();

  return true;
};

export const acceptCall = async () => {
  if (!isIncoming.value || !roomId.value || !topicId.value) return;

  const sdk = getChatSDK();
  const me = getAuthUser();
  if (!sdk || !me) return;
  clearCallStatusNotice();
  shouldEndCallOnConnectFailure = false;

  if (!callStartedAt.value) {
    const callStatus = await getLiveKitCallStatus(roomId.value, topicId.value);
    setCallStartedAt(callStatus?.startTime ?? null);
  }

  stopRingtone();
  if (Capacitor.isNativePlatform()) {
    endAllCallKits();
  }

  isAcceptingLocally = true;
  localAcceptRoomId = roomId.value;
  localAcceptTopicId = topicId.value;
  const answerAck = await sdk.sendWebSocketEventWithAck<
    WebSocketEventType.ANSWER_CALL,
    CallSocketAck
  >(WebSocketEventType.ANSWER_CALL, {
    roomId: roomId.value,
    topicId: topicId.value,
    userId: me.id
  });
  applyCallSocketAck(answerAck, {
    roomId: roomId.value,
    topicId: topicId.value,
    startTime: callStartedAt.value,
    isNewCall: false
  });
  if (answerAck?.accepted === false) {
    isAcceptingLocally = false;
    showTransientCallStatusNotice('Звонок уже завершен');
    return;
  }
  localAcceptRoomId = roomId.value;
  localAcceptTopicId = topicId.value;

  try {
    await connectToRoom();
  } finally {
    isAcceptingLocally = false;
  }
};

export const joinPendingGroupCall = async (targetTopicId?: string) => {
  const pendingGroupCall = targetTopicId
    ? activeGroupCalls.value[targetTopicId]
    : null;
  if (!pendingGroupCall || open.value) return;

  const sdk = getChatSDK();
  const me = getAuthUser();
  const {
    roomId: pendingRoomId,
    topicId: pendingTopicId,
    caller
  } = pendingGroupCall;

  if (!sdk || !me) return;
  clearCallStatusNotice();
  shouldEndCallOnConnectFailure = false;

  const callStatus = await getLiveKitCallStatus(pendingRoomId, pendingTopicId);
  if (!callStatus?.active) return;

  user.value = caller || null;
  roomId.value = pendingRoomId;
  topicId.value = pendingTopicId;
  setCallStartedAt(pendingGroupCall.startTime ?? callStatus.startTime ?? null);
  open.value = true;
  isIncoming.value = false;
  isCalling.value = true;
  isModalVisible.value = true;

  isAcceptingLocally = true;
  localAcceptRoomId = pendingRoomId;
  localAcceptTopicId = pendingTopicId;
  const answerAck = await sdk.sendWebSocketEventWithAck<
    WebSocketEventType.ANSWER_CALL,
    CallSocketAck
  >(WebSocketEventType.ANSWER_CALL, {
    roomId: pendingRoomId,
    topicId: pendingTopicId,
    userId: me.id
  });
  applyCallSocketAck(answerAck, {
    roomId: pendingRoomId,
    topicId: pendingTopicId,
    startTime: pendingGroupCall.startTime ?? callStatus.startTime ?? null,
    isNewCall: false
  });
  if (answerAck?.accepted === false) {
    isAcceptingLocally = false;
    showTransientCallStatusNotice('Звонок уже завершен');
    return;
  }
  localAcceptRoomId = roomId.value;
  localAcceptTopicId = topicId.value;

  try {
    await connectToRoom();
  } finally {
    isAcceptingLocally = false;
  }
};

export const hydrateInvitedGroupCallFromUrl = async () => {
  const sdk = getChatSDK();
  const inviteParams = getInviteParamsFromUrl();

  if (!sdk || !inviteParams) return;

  const preview = await sdk.getGroupCallInvitePreview(
    inviteParams.roomId,
    inviteParams.inviteToken
  );

  if (!preview) return;

  invitedGroupCall.value = {
    roomId: preview.roomId,
    topicId: preview.topicId,
    inviteToken: inviteParams.inviteToken,
    title: preview.title,
    avatarUrl: preview.avatarUrl || null,
    startTime: preview.startTime ?? null,
    participantCount: preview.participantCount,
    members: (preview.members || []) as IUser[],
    isJoinAvailable: true
  };

  if (!open.value) {
    await joinInvitedGroupCall();
  }
};

export const joinInvitedGroupCall = async () => {
  const sdk = getChatSDK();
  const me = getAuthUser();
  const invite = invitedGroupCall.value;

  if (!sdk || !me || !invite || open.value) return;
  clearCallStatusNotice();
  shouldEndCallOnConnectFailure = false;

  const callStatus = await getLiveKitCallStatus(invite.roomId, invite.topicId);
  if (!callStatus?.active) return;

  user.value = me as any;
  roomId.value = invite.roomId;
  topicId.value = invite.topicId;
  setCallStartedAt(invite.startTime ?? callStatus.startTime ?? null);
  open.value = true;
  isIncoming.value = false;
  isCalling.value = true;
  isModalVisible.value = true;

  isAcceptingLocally = true;
  localAcceptRoomId = invite.roomId;
  localAcceptTopicId = invite.topicId;
  const answerAck = await sdk.sendWebSocketEventWithAck<
    WebSocketEventType.ANSWER_CALL,
    CallSocketAck
  >(WebSocketEventType.ANSWER_CALL, {
    roomId: invite.roomId,
    topicId: invite.topicId,
    userId: me.id
  });
  applyCallSocketAck(answerAck, {
    roomId: invite.roomId,
    topicId: invite.topicId,
    startTime: invite.startTime ?? callStatus.startTime ?? null,
    isNewCall: false
  });
  if (answerAck?.accepted === false) {
    isAcceptingLocally = false;
    showTransientCallStatusNotice('Звонок уже завершен');
    return;
  }
  localAcceptRoomId = roomId.value;
  localAcceptTopicId = topicId.value;

  try {
    await connectToRoom();
    clearInviteParamsFromUrl();
  } finally {
    isAcceptingLocally = false;
  }
};

export const handleCallAnswered = async (
  answeredUserId: string,
  answeredRoomId?: string,
  answeredTopicId?: string | null,
  answeredStartTime?: number | null
) => {
  markIncomingCallDismissed(answeredRoomId, answeredTopicId);

  const matchesCurrentCall =
    (answeredRoomId && roomId.value === answeredRoomId) ||
    (answeredTopicId && topicId.value === answeredTopicId);
  const matchesLocalAccept =
    (answeredRoomId && localAcceptRoomId === answeredRoomId) ||
    (answeredTopicId && localAcceptTopicId === answeredTopicId);

  if (answeredRoomId && roomId.value === answeredRoomId) {
    setCallStartedAt(answeredStartTime ?? callStartedAt.value);
  }

  if (matchesLocalAccept) {
    open.value = true;
    isModalVisible.value = true;
  }

  const me = getAuthUser();
  if (
    me &&
    answeredUserId === me.id &&
    matchesCurrentCall &&
    !isAcceptingLocally &&
    !matchesLocalAccept
  ) {
    cleanup(false);
  }
};

export const handleCallEnded = (
  endedRoomId?: string | null,
  endedTopicId?: string | null,
  reason?: CallEndReason
) => {
  if (matchesPendingEndCall(endedRoomId, endedTopicId)) {
    resetPendingEndCallState();
    roomId.value = null;
    topicId.value = null;
    return;
  }

  const matchesCurrentCall =
    (endedRoomId && roomId.value === endedRoomId) ||
    (endedTopicId && topicId.value === endedTopicId) ||
    (!endedRoomId && !endedTopicId);

  if (
    reason === 'busy' &&
    matchesCurrentCall &&
    isCalling.value &&
    !isIncoming.value
  ) {
    showTransientCallStatusNotice('Пользователь занят');
    return;
  }

  if (matchesCurrentCall) {
    cleanup(true);
  }
};

export const dismissIncomingCallState = (
  targetRoomId?: string,
  targetTopicId?: string
) => {
  markIncomingCallDismissed(targetRoomId, targetTopicId);
  removePendingGroupCallEntry(targetTopicId);
  removeInvitedGroupCallEntry(targetRoomId);

  const matchesCurrentIncomingCall =
    isIncoming.value &&
    ((roomId.value && targetRoomId && roomId.value === targetRoomId) ||
      (topicId.value && targetTopicId && topicId.value === targetTopicId));

  if (matchesCurrentIncomingCall && isAcceptingLocally) {
    open.value = true;
    isModalVisible.value = true;
    return;
  }

  if (
    matchesCurrentIncomingCall &&
    ((targetRoomId && localAcceptRoomId === targetRoomId) ||
      (targetTopicId && localAcceptTopicId === targetTopicId))
  ) {
    open.value = true;
    isModalVisible.value = true;
    return;
  }

  if (matchesCurrentIncomingCall) {
    cleanup(false);
    return;
  }

  if (Capacitor.isNativePlatform()) {
    void endAllCallKits();
  }
};

export const syncActiveCalls = async (
  calls: Array<{
    roomId: string;
    topicId: string;
    callType: string;
    startTime: number;
  }>
) => {
  const validatedCalls = await Promise.all(
    calls.map(async call => {
      const status = await getLiveKitCallStatus(call.roomId, call.topicId);

      if (!status?.active || (status.participantCount ?? 0) <= 0) {
        return null;
      }

      return {
        ...call,
        startTime: status.startTime ?? call.startTime
      };
    })
  );

  activeGroupCalls.value = validatedCalls.reduce<
    Record<string, ActiveGroupCallEntry>
  >((acc, call) => {
    if (!call) {
      return acc;
    }

    acc[call.topicId] = {
      roomId: call.roomId,
      topicId: call.topicId,
      startTime: call.startTime
    };
    return acc;
  }, {});
};

export const copyInvitedGroupCallLink = async () => {
  const sdk = getChatSDK();
  const activeRoomId = roomId.value;

  if (!sdk || !activeRoomId) return false;

  const invite = await sdk.createGroupCallInvite(activeRoomId);
  if (!invite) return false;

  const currentUrl = new URL(window.location.href);
  const url = new URL(window.location.origin);
  url.searchParams.set('callRoom', invite.roomId);
  url.searchParams.set('callInvite', invite.inviteToken);

  const organization = currentUrl.searchParams.get('organization');
  if (organization) {
    url.searchParams.set('organization', organization);
  }

  await navigator.clipboard.writeText(url.toString());
  return true;
};

export const toggleMic = async () => {
  state.isMicActive = !state.isMicActive;
  if (room) {
    await room.localParticipant.setMicrophoneEnabled(state.isMicActive);
  }
};

export const toggleVideo = async () => {
  state.isVideoActive = !state.isVideoActive;
  if (!room) return;

  await room.localParticipant.setCameraEnabled(state.isVideoActive);
  syncLocalTrackState();
};

export const switchCamera = async () => {
  if (!Capacitor.isNativePlatform() || !room || !state.isVideoActive) {
    return;
  }

  const cameraPublication = Array.from(
    room.localParticipant.videoTrackPublications.values()
  ).find(publication => publication.source === Track.Source.Camera);
  const localVideoTrack = cameraPublication?.track;

  if (!(localVideoTrack instanceof LocalVideoTrack)) {
    return;
  }

  currentCameraFacingMode =
    currentCameraFacingMode === 'user' ? 'environment' : 'user';

  try {
    await localVideoTrack.restartTrack({
      facingMode: currentCameraFacingMode
    });
    syncLocalTrackState();
  } catch (error) {
    currentCameraFacingMode =
      currentCameraFacingMode === 'user' ? 'environment' : 'user';
    console.warn('[LiveKit] Failed to switch camera:', error);
  }
};

export const toggleSpeaker = async () => {
  state.isSpeakerActive = !state.isSpeakerActive;

  if (Capacitor.isNativePlatform()) {
    await AudioOutput.toggleAudio({
      useSpeaker: state.isSpeakerActive
    }).catch(err => console.warn('[LiveKit] Audio output failed:', err));
  }
};

export const toggleScreenShare = async () => {
  if (!room) return;

  if (!state.isScreenSharingActive) {
    const remoteScreenShareParticipant = remoteParticipants.value.find(
      participant => participant.isScreenShareActive
    );

    if (remoteScreenShareParticipant) {
      return;
    }
  }

  state.isScreenSharingActive = !state.isScreenSharingActive;
  await room.localParticipant.setScreenShareEnabled(
    state.isScreenSharingActive
  );
  await ensureLocalMicrophoneState(room);
  syncLocalTrackState();
  syncRemoteParticipantState();
};

export const toggleHandRaise = async () => {
  if (!room) return;

  const nextValue = !state.isHandRaised;

  try {
    state.isHandRaised = nextValue;
    await publishHandRaiseState(nextValue);
  } catch (error) {
    state.isHandRaised = !nextValue;
    console.warn('[LiveKit] Failed to update hand raise state:', error);
  }
};

export const leaveCall = () => {
  const activeRoomId = roomId.value;
  const activeTopicId = topicId.value;
  const activeCaller = user.value;
  const activeTopic = activeTopicId
    ? (useTopics().getSelectedTopic(activeTopicId) as any)
    : null;

  if (
    activeRoomId &&
    activeTopicId &&
    invitedGroupCall.value?.roomId !== activeRoomId &&
    activeTopic?.type === TopicType.Group
  ) {
    restoreGroupCallEntryIfStillActive(
      activeRoomId,
      activeTopicId,
      activeCaller,
      callStartedAt.value
    );
  }

  schedulePendingEndCallConfirmation(activeRoomId, activeTopicId);
  emitEndCallEvent(activeRoomId, activeTopicId);

  if (invitedGroupCall.value?.roomId === activeRoomId) {
    invitedGroupCall.value = null;
  }

  connectAttemptId += 1;
  connectPromise = null;
  shouldEndCallOnConnectFailure = false;
  clearLocalAcceptState();
  clearCallStatusNotice();
  clearDialingTimeout();
  stopTimer();
  stopRingtone();
  stopDialingSound();

  const activeRoom = room;

  stopLocalMediaTracks();

  if (activeRoom) {
    activeRoom.disconnect();
  }

  room = null;
  open.value = false;
  isIncoming.value = false;
  isCalling.value = false;
  isModalVisible.value = false;
  user.value = null;
  resetMediaState();

  if (Capacitor.isNativePlatform()) {
    endAllCallKits();
  }
};

export const cleanup = (disconnectRoom = true) => {
  connectAttemptId += 1;
  connectPromise = null;
  shouldEndCallOnConnectFailure = false;
  clearLocalAcceptState();
  clearCallStatusNotice();
  resetPendingEndCallState();
  clearDialingTimeout();
  stopTimer();
  stopRingtone();
  stopDialingSound();

  const activeRoom = room;

  stopLocalMediaTracks();

  if (disconnectRoom && activeRoom) {
    activeRoom.disconnect();
  }

  room = null;
  open.value = false;
  isIncoming.value = false;
  isCalling.value = false;
  isModalVisible.value = false;
  user.value = null;
  roomId.value = null;
  topicId.value = null;
  resetMediaState();

  if (Capacitor.isNativePlatform()) {
    endAllCallKits();
  }
};

export const handleIncomingPushCall = async (
  targetUser: IUser | null,
  callRoomId: string,
  callTopicId: string,
  callTopicType?: TopicType | string | null,
  callStartTime?: number | null
) => {
  const isReceived = await receiveIncomingCall(
    targetUser,
    callRoomId,
    callTopicId,
    callTopicType,
    callStartTime
  );

  if (
    isReceived &&
    Capacitor.isNativePlatform() &&
    callTopicType !== TopicType.Group
  ) {
    App.getState().then(appState => {
      if (!appState.isActive) {
        const pushUser = targetUser as any;
        showIncomingCallKit(
          pushUser.initials,
          callRoomId,
          pushUser.avatarUrl,
          callTopicId
        );
      }
    });
  }
};

export const handleNativeCallAction = async (
  action: 'accept' | 'decline',
  incomingRoomId?: string,
  incomingTopicId?: string,
  attempt = 0
) => {
  if (Capacitor.isNativePlatform() && attempt === 0) {
    await endAllCallKits();
  }

  const sdk = getChatSDK();
  const me = getAuthUser();

  if (!sdk || !me || !sdk.isConnected()) {
    scheduleNativeCallActionRetry(
      action,
      incomingRoomId,
      incomingTopicId,
      attempt
    );
    return;
  }

  if (action === 'accept') {
    const targetRoomId = incomingRoomId || roomId.value;
    const targetTopicId = resolveCallTargetTopicId(
      incomingRoomId,
      incomingTopicId
    );
    const isAvailable = await isLiveKitCallAvailable(
      targetRoomId,
      targetTopicId
    );

    if (!isAvailable) {
      cleanup(false);
      return;
    }

    if (incomingRoomId) {
      roomId.value = incomingRoomId;
    }

    if (incomingTopicId || incomingRoomId) {
      topicId.value = incomingTopicId || incomingRoomId || null;
    }

    isIncoming.value = true;
    open.value = true;
    isModalVisible.value = true;

    await acceptCall();
    return;
  }

  const targetRoomId = incomingRoomId || roomId.value;
  const targetTopicId = resolveCallTargetTopicId(
    incomingRoomId,
    incomingTopicId
  );
  const isCurrentCallTarget =
    !incomingRoomId || !roomId.value || roomId.value === incomingRoomId;

  if (!isCurrentCallTarget) {
    emitEndCallEvent(targetRoomId, targetTopicId);
    return;
  }

  if (incomingRoomId) {
    roomId.value = incomingRoomId;
  }

  if (targetTopicId) {
    topicId.value = targetTopicId;
  }

  if (roomId.value && topicId.value) {
    leaveCall();
    return;
  }

  cleanup(true);
};

export const clearActiveGroupCall = (targetTopicId?: string) => {
  removePendingGroupCallEntry(targetTopicId);
};

export const clearInvitedGroupCall = (activeRoomId?: string) => {
  removeInvitedGroupCallEntry(activeRoomId);
};

export { open, isIncoming, isCalling, user, roomId, topicId, isModalVisible };
export {
  state,
  formattedTime,
  callStatusNotice,
  localVideoStream,
  localScreenShareStream,
  remoteParticipants,
  isRemoteVideoActive,
  activeGroupCalls,
  activeScreenShare,
  invitedGroupCall
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (open.value) {
      leaveCall();
    }
  });
}
