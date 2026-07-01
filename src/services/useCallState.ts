import { computed, reactive, ref } from 'vue';
import type { IUser } from '../components/interfaces/interfaces';
import type { AudioOutputRoute } from './useAudioOutput';

export type CallReaction =
  | 'heart'
  | 'thumbs-up'
  | 'thumbs-down'
  | 'joy'
  | 'sob';

export type ParticipantMediaState = {
  identity: string;
  name: string;
  videoStream: MediaStream | null;
  cameraStream: MediaStream | null;
  screenShareStream: MediaStream | null;
  audioStream: MediaStream | null;
  isVideoActive: boolean;
  isScreenShareActive: boolean;
  isHandRaised: boolean;
  activeReaction: CallReaction | null;
  activeReactionExpiresAt: number | null;
  isSpeaking: boolean;
  audioLevel: number;
  isMicActive: boolean;
  connectionQuality: string;
};

export type ActiveGroupCallEntry = {
  roomId: string;
  topicId: string;
  caller?: IUser | null;
  startTime?: number | null;
  participantCount?: number;
  groupMode?: boolean;
  elapsedDurationMs?: number;
};

export type CallStatusNoticeKind = 'reconnecting' | 'ended' | 'error';

export const open = ref(false);
export const isIncoming = ref(false);
export const isCalling = ref(false);
export const user = ref<IUser | null>(null);
export const roomId = ref<string | null>(null);
export const topicId = ref<string | null>(null);
export const callStartedAt = ref<number | null>(null);
export const callElapsedMs = ref(0);
export const timerSeconds = ref(0);
export const isModalVisible = ref(false);
export const isRemoteVideoActive = ref(false);
export const localVideoStream = ref<MediaStream | null>(null);
export const localScreenShareStream = ref<MediaStream | null>(null);
export const handRaisedParticipants = ref<Record<string, boolean>>({});
export const participantReactions = ref<
  Record<string, { reaction: CallReaction; expiresAt: number }>
>({});
export const remoteParticipants = ref<ParticipantMediaState[]>([]);
export const callStatusNotice = ref<string | null>(null);
export const callStatusNoticeKind = ref<CallStatusNoticeKind | null>(null);
export const pendingEndCallRoomId = ref<string | null>(null);
export const pendingEndCallTopicId = ref<string | null>(null);
export const activeGroupCalls = ref<Record<string, ActiveGroupCallEntry>>({});
export const invitedGroupCall = ref<{
  roomId: string;
  topicId?: string | null;
  inviteToken: string;
  title: string;
  avatarUrl?: string | null;
  startTime?: number | null;
  elapsedDurationMs?: number;
  participantCount: number;
  members: IUser[];
  isJoinAvailable: boolean;
} | null>(null);

export const state = reactive({
  isMicActive: false,
  isVideoActive: false,
  isScreenSharingActive: false,
  isSpeakerActive: false,
  audioOutputRoute: 'earpiece' as Exclude<AudioOutputRoute, 'auto'>,
  audioOutputDefaultRoute: 'earpiece' as Exclude<AudioOutputRoute, 'auto'>,
  audioOutputAvailableRoutes: ['earpiece', 'speaker'] as Array<
    Exclude<AudioOutputRoute, 'auto'>
  >,
  isFullScreen: false,
  isHandRaised: false,
  isSpeaking: false,
  audioLevel: 0,
  connectionQuality: 'unknown',
  activeReaction: null as CallReaction | null,
  activeReactionExpiresAt: null as number | null
});

const formatTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const formattedTime = computed(() => formatTime(timerSeconds.value));

export const activeScreenShare = computed(() => {
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

export const activeCallUser = computed(() => user.value as any);
export const activeCallTopicId = computed(() => topicId.value);
export const isCallActive = computed(() => open.value);
export const activeCallParticipantCount = computed(() =>
  open.value ? remoteParticipants.value.length + 1 : 0
);
export const hasPendingGroupCall = computed(
  () => Object.keys(activeGroupCalls.value).length > 0
);
export const pendingGroupCallInfo = computed(() => activeGroupCalls.value);
export const invitedGroupCallInfo = computed(() => invitedGroupCall.value);
export const isAnyCallModalVisible = computed(() => isModalVisible.value);
export const isAnyCallDialing = computed(() => isCalling.value);
export const isAnyCallIncoming = computed(() => isIncoming.value);
export const activeCallFormattedTime = computed(() => formattedTime.value);
