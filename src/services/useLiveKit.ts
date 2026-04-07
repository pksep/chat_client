import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { RemoteParticipant, Room, RoomEvent, Track } from 'livekit-client';
import { computed, reactive, ref } from 'vue';
import type { IUser } from '../components/interfaces/interfaces';
import { getAuthUser } from '../composables/useAuth';
import { AudioOutput } from './useAudioOutput';
import { endAllCallKits, showIncomingCallKit } from './useCallKit';
import { getChatSDK } from './useChat';
import { WebSocketEventType } from './useChatSDK/websocketEvents';
import { TopicType } from './useChatSDK/types';
import { useTopics } from '../composables/useTopics';

const open = ref(false);
const isIncoming = ref(false);
const isCalling = ref(false);
const user = ref<IUser | null>(null);
const roomId = ref<string | null>(null);
const topicId = ref<string | null>(null);
const timerSeconds = ref(0);
const isModalVisible = ref(false);
const isRemoteVideoActive = ref(false);
const localVideoStream = ref<MediaStream | null>(null);
const localScreenShareStream = ref<MediaStream | null>(null);
const handRaisedParticipants = ref<Record<string, boolean>>({});
const remoteParticipants = ref<
  Array<{
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
  }>
>([]);
const activeGroupCalls = ref<
  Record<
    string,
    {
      roomId: string;
      topicId: string;
      caller?: IUser | null;
    }
  >
>({});
const invitedGroupCall = ref<{
  roomId: string;
  topicId: string;
  inviteToken: string;
  title: string;
  avatarUrl?: string | null;
  participantCount: number;
  members: IUser[];
  isJoinAvailable: boolean;
} | null>(null);

const state = reactive({
  isMicActive: true,
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

const createRoomId = () => `livekit-${Math.random().toString(36).slice(2, 10)}`;

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
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

const startTimer = () => {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    timerSeconds.value += 1;
  }, 1000);
};

const stopTimer = () => {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerSeconds.value = 0;
};

const playRingtone = () => {
  if (Capacitor.isNativePlatform() || ringtoneAudio) return;
  ringtoneAudio = new Audio('/audio/ringtone.mp3');
  ringtoneAudio.loop = true;
  ringtoneAudio
    .play()
    .catch(err => console.warn('[LiveKit] Ringtone failed:', err));
};

const stopRingtone = () => {
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

const stopLocalMediaTracks = () => {
  if (!room) return;

  room.localParticipant.audioTrackPublications.forEach(publication => {
    stopTrackPublication(publication);
  });

  room.localParticipant.videoTrackPublications.forEach(publication => {
    stopTrackPublication(publication);
  });

  localVideoStream.value?.getTracks().forEach(track => track.stop());
  localScreenShareStream.value?.getTracks().forEach(track => track.stop());
  localVideoStream.value = null;
  localScreenShareStream.value = null;
};

const syncLocalTrackState = () => {
  if (!room) {
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

  localVideoStream.value = localVideoTrack?.mediaStreamTrack
    ? new MediaStream([localVideoTrack.mediaStreamTrack])
    : null;
  localScreenShareStream.value = localScreenTrack?.mediaStreamTrack
    ? new MediaStream([localScreenTrack.mediaStreamTrack])
    : null;
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

const syncRemoteParticipantState = () => {
  const activeRoom = room;
  if (!activeRoom) {
    remoteParticipants.value = [];
    isRemoteVideoActive.value = false;
    return;
  }

  remoteParticipants.value = Array.from(
    activeRoom.remoteParticipants.values()
  ).map(remoteParticipant => {
    const cameraPublication = getActiveRemoteVideoPublication(
      remoteParticipant,
      Track.Source.Camera
    );
    const screenSharePublication = getActiveRemoteVideoPublication(
      remoteParticipant,
      Track.Source.ScreenShare
    );
    const audioPublication = getActiveRemoteAudioPublication(remoteParticipant);
    const preferredVideoPublication =
      screenSharePublication || cameraPublication;

    return {
      identity: remoteParticipant.identity,
      name: remoteParticipant.name || remoteParticipant.identity,
      videoStream: preferredVideoPublication?.track?.mediaStreamTrack
        ? new MediaStream([preferredVideoPublication.track.mediaStreamTrack])
        : null,
      cameraStream: cameraPublication?.track?.mediaStreamTrack
        ? new MediaStream([cameraPublication.track.mediaStreamTrack])
        : null,
      screenShareStream: screenSharePublication?.track?.mediaStreamTrack
        ? new MediaStream([screenSharePublication.track.mediaStreamTrack])
        : null,
      audioStream: audioPublication?.track?.mediaStreamTrack
        ? new MediaStream([audioPublication.track.mediaStreamTrack])
        : null,
      isVideoActive: !!preferredVideoPublication?.track?.mediaStreamTrack,
      isScreenShareActive: !!screenSharePublication?.track?.mediaStreamTrack,
      isHandRaised: !!handRaisedParticipants.value[remoteParticipant.identity],
      isSpeaking: !!remoteParticipant.isSpeaking,
      isMicActive: !!audioPublication?.track?.mediaStreamTrack
    };
  });

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

const syncConnectionState = (activeRoom: Room) => {
  const hasRemoteParticipant = activeRoom.remoteParticipants.size > 0;

  isIncoming.value = false;

  if (hasRemoteParticipant) {
    isCalling.value = false;
    startTimer();
    stopDialingSound();
    stopRingtone();
    return;
  }

  stopTimer();
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
      syncRemoteParticipantState();
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
    .on(RoomEvent.LocalTrackPublished, () => {
      syncLocalTrackState();
    })
    .on(RoomEvent.LocalTrackUnpublished, () => {
      syncLocalTrackState();
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
      void enforceSingleScreenShare();
    })
    .on(RoomEvent.Disconnected, () => {
      cleanup(false);
    });
};

const getToken = async (activeRoomId: string, userId: string) => {
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

  return sdk.getLiveKitToken(activeRoomId, userId);
};

const connectToRoom = async () => {
  const sdk = getChatSDK();
  const me = getAuthUser();
  const activeRoomId = roomId.value;
  const config = sdk?.getConfig();

  if (!sdk || !me || !activeRoomId || !config?.CHAT_LIVEKIT_URL) {
    throw new Error('LiveKit config is incomplete');
  }

  const token = await getToken(activeRoomId, me.id);
  if (!token) {
    throw new Error('Failed to get LiveKit token');
  }

  room?.disconnect();
  room = new Room({
    adaptiveStream: true,
    dynacast: true
  });

  setupRoomListeners(room);
  await room.connect(config.CHAT_LIVEKIT_URL, token);
  await room.localParticipant.setMicrophoneEnabled(state.isMicActive);
  if (state.isVideoActive) {
    await room.localParticipant.setCameraEnabled(true);
  }

  syncLocalTrackState();
  syncRemoteParticipantState();
  syncConnectionState(room);
  stopDialingSound();
  stopRingtone();
};

const resetMediaState = () => {
  localVideoStream.value = null;
  localScreenShareStream.value = null;
  remoteParticipants.value = [];
  handRaisedParticipants.value = {};
  isRemoteVideoActive.value = false;
  state.isMicActive = true;
  state.isVideoActive = false;
  state.isScreenSharingActive = false;
  state.isSpeakerActive = false;
  state.isFullScreen = false;
  state.isHandRaised = false;
};

export const startLiveKitCall = async (
  targetUser: IUser,
  currentTopicId: string
) => {
  if (open.value) return;

  const sdk = getChatSDK();
  const me = getAuthUser();
  if (!sdk || !me) return;

  user.value = targetUser;
  topicId.value = currentTopicId;
  roomId.value = createRoomId();
  open.value = true;
  isCalling.value = true;
  isModalVisible.value = true;
  playDialingSound();

  sdk.sendWebSocketEvent(WebSocketEventType.START_CALL, {
    roomId: roomId.value,
    topicId: currentTopicId,
    userId: me.id
  });

  await connectToRoom();

  clearDialingTimeout();
  dialingTimeout = setTimeout(() => {
    if (isCalling.value) {
      leaveCall();
    }
  }, 20000);
};

export const startLiveKitGroupCall = async (currentTopicId: string) => {
  if (open.value || activeGroupCalls.value[currentTopicId]) return;

  const sdk = getChatSDK();
  const me = getAuthUser();
  if (!sdk || !me) return;

  const activeRoomId = createRoomId();
  user.value = me as any;
  topicId.value = currentTopicId;
  roomId.value = activeRoomId;
  open.value = true;
  isIncoming.value = false;
  isCalling.value = true;
  isModalVisible.value = true;

  activeGroupCalls.value = {
    ...activeGroupCalls.value,
    [currentTopicId]: {
      roomId: activeRoomId,
      topicId: currentTopicId,
      caller: me as any
    }
  };

  sdk.sendWebSocketEvent(WebSocketEventType.START_CALL, {
    roomId: activeRoomId,
    topicId: currentTopicId,
    userId: me.id
  });

  await connectToRoom();
};

export const receiveIncomingCall = (
  targetUser: IUser,
  incomingRoomId: string,
  incomingTopicId: string
) => {
  const topic = useTopics().getSelectedTopic(incomingTopicId) as any;

  if (topic?.type === TopicType.Group) {
    activeGroupCalls.value = {
      ...activeGroupCalls.value,
      [incomingTopicId]: {
        roomId: incomingRoomId,
        topicId: incomingTopicId,
        caller: targetUser
      }
    };
    return;
  }

  if (open.value) return;

  user.value = targetUser;
  roomId.value = incomingRoomId;
  topicId.value = incomingTopicId;
  open.value = true;
  isIncoming.value = true;
  isModalVisible.value = true;
  playRingtone();
};

export const acceptCall = async () => {
  if (!isIncoming.value || !roomId.value || !topicId.value) return;

  const sdk = getChatSDK();
  const me = getAuthUser();
  if (!sdk || !me) return;

  stopRingtone();
  if (Capacitor.isNativePlatform()) {
    endAllCallKits();
  }

  sdk.sendWebSocketEvent(WebSocketEventType.ANSWER_CALL, {
    roomId: roomId.value,
    topicId: topicId.value,
    userId: me.id
  });

  isAcceptingLocally = true;
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

  user.value = caller || null;
  roomId.value = pendingRoomId;
  topicId.value = pendingTopicId;
  open.value = true;
  isIncoming.value = false;
  isCalling.value = true;
  isModalVisible.value = true;

  sdk.sendWebSocketEvent(WebSocketEventType.ANSWER_CALL, {
    roomId: pendingRoomId,
    topicId: pendingTopicId,
    userId: me.id
  });

  await connectToRoom();
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

  user.value = me as any;
  roomId.value = invite.roomId;
  topicId.value = invite.topicId;
  open.value = true;
  isIncoming.value = false;
  isCalling.value = true;
  isModalVisible.value = true;

  sdk.sendWebSocketEvent(WebSocketEventType.ANSWER_CALL, {
    roomId: invite.roomId,
    topicId: invite.topicId,
    userId: me.id
  });

  await connectToRoom();
  clearInviteParamsFromUrl();
};

export const handleCallAnswered = async (
  answeredUserId: string,
  answeredRoomId?: string
) => {
  const me = getAuthUser();
  if (
    me &&
    answeredUserId === me.id &&
    isIncoming.value &&
    roomId.value === answeredRoomId &&
    !isAcceptingLocally
  ) {
    cleanup(false);
  }
};

export const handleCallEnded = () => {
  cleanup(false);
};

export const syncActiveCalls = (
  calls: Array<{ roomId: string; topicId: string; callType: string }>
) => {
  activeGroupCalls.value = calls.reduce<
    Record<
      string,
      {
        roomId: string;
        topicId: string;
        caller?: IUser | null;
      }
    >
  >((acc, call) => {
    acc[call.topicId] = {
      roomId: call.roomId,
      topicId: call.topicId
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
  const sdk = getChatSDK();
  const me = getAuthUser();
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
    activeGroupCalls.value = {
      ...activeGroupCalls.value,
      [activeTopicId]: {
        roomId: activeRoomId,
        topicId: activeTopicId,
        caller: activeCaller
      }
    };
  }

  if (sdk && me && activeRoomId && activeTopicId) {
    sdk.sendWebSocketEvent(WebSocketEventType.END_CALL, {
      roomId: activeRoomId,
      topicId: activeTopicId,
      userId: me.id
    });
  }

  if (invitedGroupCall.value?.roomId === activeRoomId) {
    invitedGroupCall.value = null;
  }

  cleanup(true);
};

export const cleanup = (disconnectRoom = true) => {
  clearDialingTimeout();
  stopTimer();
  stopRingtone();
  stopDialingSound();

  if (disconnectRoom && room) {
    stopLocalMediaTracks();
    room.disconnect();
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

export const handleIncomingPushCall = (
  targetUser: IUser,
  callRoomId: string,
  callTopicId: string
) => {
  receiveIncomingCall(targetUser, callRoomId, callTopicId);

  if (Capacitor.isNativePlatform()) {
    App.getState().then(appState => {
      if (!appState.isActive) {
        const pushUser = targetUser as any;
        showIncomingCallKit(pushUser.initials, callRoomId, pushUser.avatarUrl);
      }
    });
  }
};

export const handleNativeCallAction = async (
  action: 'accept' | 'decline',
  incomingRoomId?: string,
  incomingTopicId?: string
) => {
  if (action === 'accept') {
    if (incomingRoomId) {
      roomId.value = incomingRoomId;
    }

    if (incomingTopicId || incomingRoomId) {
      topicId.value = incomingTopicId || incomingRoomId || null;
    }

    open.value = true;
    isIncoming.value = true;
    isModalVisible.value = true;

    await acceptCall();
    return;
  }

  if (
    !incomingRoomId ||
    !roomId.value ||
    roomId.value === incomingRoomId ||
    isIncoming.value
  ) {
    leaveCall();
  }
};

export const clearActiveGroupCall = (targetTopicId?: string) => {
  if (!targetTopicId) return;

  const nextActiveGroupCalls = { ...activeGroupCalls.value };
  delete nextActiveGroupCalls[targetTopicId];
  activeGroupCalls.value = nextActiveGroupCalls;
};

export const clearInvitedGroupCall = (activeRoomId?: string) => {
  if (!invitedGroupCall.value) return;
  if (activeRoomId && invitedGroupCall.value.roomId !== activeRoomId) return;

  invitedGroupCall.value = null;
};

export { open, isIncoming, isCalling, user, roomId, topicId, isModalVisible };
export {
  state,
  formattedTime,
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
