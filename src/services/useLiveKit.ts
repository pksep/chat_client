import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import {
  BackgroundProcessor,
  type BackgroundProcessorWrapper
} from '@livekit/track-processors';
import {
  type AudioCaptureOptions,
  createLocalVideoTrack,
  ConnectionQuality,
  DisconnectReason,
  LocalTrackPublication,
  LocalVideoTrack,
  Participant,
  RemoteParticipant,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  VideoPresets,
  VideoQuality
} from 'livekit-client';
import { MessageTypeEnum } from '@pksep/yui';
import { computed, reactive, ref, watch } from 'vue';
import type { IUser } from '../components/interfaces/interfaces';
import { getAuthUser } from '../composables/useAuth';
import { useCallBackground } from '../composables/useCallBackground';
import {
  showErrorNotification,
  showNotification
} from '../composables/useNotifications';
import {
  playNativeNotificationSound,
  shouldPlayNotificationSound
} from './useNotificationSoundPolicy';
import {
  AudioOutput,
  type AudioOutputRoute,
  type AudioOutputState
} from './useAudioOutput';
import {
  isAndroidScreenSharePlatform,
  prepareAndroidScreenShare,
  stopAndroidScreenShare
} from './useAndroidScreenShare';
import {
  CALL_BACKGROUND_ASSET_PATHS,
  MULTICLASS_VIRTUAL_BACKGROUND_DEFAULTS
} from './callBackgroundProcessorConfig';
import { prewarmCallBackgroundAssets } from './callBackgroundWarmup';
import { createMediapipeMulticlassBackgroundTrackProcessor } from './mediapipeMulticlassBackgroundTrackProcessor';
import { copyTextToClipboard } from '../utils/copyTextToClipboard';
import { parseGroupCallInviteUrl } from '../utils/groupCallInviteUrl';
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
  groupMode?: boolean;
  elapsedDurationMs?: number;
};

type ActiveGroupCallEntry = {
  roomId: string;
  topicId: string;
  caller?: IUser | null;
  startTime?: number | null;
  participantCount?: number;
  groupMode?: boolean;
  elapsedDurationMs?: number;
};

export type CallReaction =
  | 'heart'
  | 'thumbs-up'
  | 'thumbs-down'
  | 'joy'
  | 'sob';

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
  activeReaction: CallReaction | null;
  activeReactionExpiresAt: number | null;
  isSpeaking: boolean;
  audioLevel: number;
  isMicActive: boolean;
  connectionQuality: ConnectionQuality;
};

type StreamCacheEntry = {
  trackId: string;
  track: MediaStreamTrack;
  stream: MediaStream;
};

type RemoteReconnectingParticipantEntry = {
  participant: ParticipantMediaState;
  timeout: ReturnType<typeof setTimeout>;
};

type CallEndReason = 'busy';
type RemoteVideoSource = 'camera' | 'screen';
type CallStatusNoticeKind = 'reconnecting' | 'ended' | 'error';
type DirectCallRecoveryOptions = {
  waitForRemote?: boolean;
  remoteUserId?: string | null;
};

type CallSocketAck = {
  accepted?: boolean;
  roomId?: string | null;
  topicId?: string | null;
  startTime?: number | null;
  elapsedDurationMs?: number;
  isNewCall?: boolean;
};

const open = ref(false);
const isIncoming = ref(false);
const isCalling = ref(false);
const user = ref<IUser | null>(null);
const roomId = ref<string | null>(null);
const topicId = ref<string | null>(null);
const callStartedAt = ref<number | null>(null);
const callElapsedMs = ref(0);
const timerSeconds = ref(0);
const isModalVisible = ref(false);
const isRemoteVideoActive = ref(false);
const localVideoStream = ref<MediaStream | null>(null);
const localScreenShareStream = ref<MediaStream | null>(null);
const handRaisedParticipants = ref<Record<string, boolean>>({});
const participantReactions = ref<
  Record<string, { reaction: CallReaction; expiresAt: number }>
>({});
const remoteParticipants = ref<ParticipantMediaState[]>([]);
const callStatusNotice = ref<string | null>(null);
const callStatusNoticeKind = ref<CallStatusNoticeKind | null>(null);
const pendingEndCallRoomId = ref<string | null>(null);
const pendingEndCallTopicId = ref<string | null>(null);
const activeGroupCalls = ref<Record<string, ActiveGroupCallEntry>>({});
const invitedGroupCall = ref<{
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

const state = reactive({
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
  connectionQuality: ConnectionQuality.Unknown,
  activeReaction: null as CallReaction | null,
  activeReactionExpiresAt: null as number | null
});

const HAND_RAISE_TOPIC = 'group-call-hand-raise';
const CALL_REACTION_TOPIC = 'group-call-reaction';
const CALL_REACTION_DURATION_MS = 4000;

let room: Room | null = null;
let ignoredDisconnectedRoom: Room | null = null;
let isNativeAppInBackground = false;
let directCallRecoveryWaitForRemote = false;
let timerInterval: ReturnType<typeof setInterval> | null = null;
let dialingTimeout: ReturnType<typeof setTimeout> | null = null;
let audioOutputRouteListener: PluginListenerHandle | null = null;
let isAudioOutputRouteListenerBound = false;
let dialingSoundWatchdogInterval: ReturnType<typeof setInterval> | null = null;
let dialingAudioContext: AudioContext | null = null;
let dialingAudioBuffer: AudioBuffer | null = null;
let dialingAudioSource: AudioBufferSourceNode | null = null;
let dialingAudioStartPromise: Promise<void> | null = null;
let ringtoneAudio: HTMLAudioElement | null = null;
let dialingAudio: HTMLAudioElement | null = null;
let isAcceptingLocally = false;
let localAcceptRoomId: string | null = null;
let localAcceptTopicId: string | null = null;
let connectPromise: Promise<void> | null = null;
let connectAttemptId = 0;
let currentCameraFacingMode: 'user' | 'environment' = 'user';
let shouldEndCallOnConnectFailure = false;
let isExplicitHangupInProgress = false;
let androidScreenShareTrack: MediaStreamTrack | null = null;
let isStoppingAndroidScreenShare = false;
const localTrackStreamCache = new Map<string, StreamCacheEntry>();
const remoteTrackStreamCache = new Map<string, StreamCacheEntry>();
let pendingEndCallRetryTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingEndCallFinalizeTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingNativeCallActionTimeout: ReturnType<typeof setTimeout> | null = null;
let callStatusNoticeTimeout: ReturnType<typeof setTimeout> | null = null;
let directCallRecoveryTimeout: ReturnType<typeof setTimeout> | null = null;
let directCallRecoveryAttemptId = 0;
let directCallRecoveryInFlight = false;
let directCallRecoveryDeadline = 0;
let directCallRecoveryRoomId: string | null = null;
let directCallRecoveryTopicId: string | null = null;
const participantReactionTimeouts = new Map<
  string,
  ReturnType<typeof setTimeout>
>();
const remoteReconnectingParticipants = new Map<
  string,
  RemoteReconnectingParticipantEntry
>();
const remoteExplicitlyLeftParticipants = new Map<
  string,
  ReturnType<typeof setTimeout>
>();
const { selectedCallBackgroundImageUrl, selectedCallBackgroundMode } =
  useCallBackground();

const MAX_NATIVE_CALL_ACTION_RETRIES = 120;
const NATIVE_CALL_ACTION_RETRY_DELAY_MS = 500;
const DISMISSED_INCOMING_CALL_TTL_MS = 15000;
const CALL_STATUS_NOTICE_CLOSE_DELAY_MS = 3000;
const ENDED_CALL_STATUS_NOTICE_CLOSE_DELAY_MS = 1200;
const DIRECT_CALL_RECONNECT_GRACE_MS = 180000;
const DIRECT_CALL_EXPLICIT_LEAVE_SUPPRESSION_MS = 30000;
const DIRECT_CALL_RECONNECT_POLL_MS = 2000;
const DIRECT_CALL_RECONNECT_FAILED_NOTICE = 'Не удалось восстановить звонок';
const DIRECT_CALL_ENDED_NOTICE = 'Звонок завершён';
const CALL_RECONNECT_NOTICE = 'Связь прервана. Переподключение';
const OTHER_DEVICE_CONNECTED_NOTICE = 'Звонок открыт на другом устройстве';
const GROUP_CALL_INVITE_TITLE = 'Групповой звонок';
const DEFAULT_AUDIO_OUTPUT_ROUTES: Array<Exclude<AudioOutputRoute, 'auto'>> = [
  'earpiece',
  'speaker'
];
const dismissedIncomingCallRooms = new Map<string, number>();
const dismissedIncomingCallTopics = new Map<string, number>();
const CAMERA_CAPTURE_DEFAULTS = {
  facingMode: 'user' as const,
  frameRate: 30,
  resolution: VideoPresets.h1080.resolution
};
const MANAGED_BACKGROUND_CAMERA_CAPTURE_DEFAULTS = {
  facingMode: 'user' as const,
  frameRate: 24,
  resolution: VideoPresets.h720.resolution
};
const CAMERA_PUBLISH_DEFAULTS = {
  degradationPreference: 'maintain-resolution' as RTCDegradationPreference,
  simulcast: true,
  videoEncoding: VideoPresets.h1080.encoding,
  videoSimulcastLayers: [VideoPresets.h216, VideoPresets.h540]
};
const MANAGED_BACKGROUND_CAMERA_PUBLISH_DEFAULTS = {
  degradationPreference: 'maintain-resolution' as RTCDegradationPreference,
  simulcast: true,
  videoEncoding: VideoPresets.h720.encoding,
  videoSimulcastLayers: [VideoPresets.h216, VideoPresets.h540]
};
const SCREEN_SHARE_CAPTURE_DEFAULTS = {
  contentHint: 'detail' as const,
  resolution: ScreenSharePresets.original.resolution,
  selfBrowserSurface: 'exclude' as const,
  surfaceSwitching: 'include' as const,
  systemAudio: 'exclude' as const
};
const SCREEN_SHARE_PUBLISH_DEFAULTS = {
  degradationPreference: 'maintain-resolution' as RTCDegradationPreference,
  simulcast: false,
  screenShareEncoding: ScreenSharePresets.original.encoding
};
const CALL_AUDIO_CAPTURE_DEFAULTS: AudioCaptureOptions = {
  echoCancellation: true,
  noiseSuppression: true,
  voiceIsolation: true,
  autoGainControl: true,
  channelCount: 1
};
type LocalManagedVideoProcessor =
  | BackgroundProcessorWrapper
  | Parameters<LocalVideoTrack['setProcessor']>[0];

let localBackgroundProcessor: LocalManagedVideoProcessor | null = null;
let localBackgroundProcessorTrack: LocalVideoTrack | null = null;
let localBackgroundProcessorSignature: string | null = null;
let hasShownBackgroundProcessorSupportError = false;
let requestedVideoActive = false;
let videoToggleOperation: Promise<void> | null = null;
let suppressParticipantPresenceNotifications = true;
let presenceAudioContext: AudioContext | null = null;
const pendingAudioRecoveryTimeouts = new Set<ReturnType<typeof setTimeout>>();
const pendingRemoteAudioResubscribeTimeouts = new Map<
  string,
  ReturnType<typeof setTimeout>
>();

const createRoomId = () => `livekit-${Math.random().toString(36).slice(2, 10)}`;

const getLocalCameraTrack = (): LocalVideoTrack | null => {
  if (!room) {
    return null;
  }

  const publication = Array.from(
    room.localParticipant.videoTrackPublications.values()
  ).find(item => item.source === Track.Source.Camera);

  return publication?.track instanceof LocalVideoTrack
    ? publication.track
    : null;
};

const getLocalCameraPublication = (activeRoom: Room) =>
  Array.from(activeRoom.localParticipant.videoTrackPublications.values()).find(
    item => item.source === Track.Source.Camera
  );

const shouldUseManagedBackgroundCamera = (): boolean =>
  selectedCallBackgroundMode.value !== 'none';

const getManagedBackgroundImageUrl = (): string | null =>
  selectedCallBackgroundMode.value === 'image'
    ? selectedCallBackgroundImageUrl.value || null
    : null;

const getCallBackgroundProcessorSignature = (): string => {
  if (selectedCallBackgroundMode.value === 'blur') {
    return 'blur';
  }

  if (selectedCallBackgroundMode.value === 'image') {
    return `image:${selectedCallBackgroundImageUrl.value || ''}`;
  }

  return 'none';
};

const shouldUseMediapipeImageBackgroundProcessor = (): boolean =>
  selectedCallBackgroundMode.value === 'image' &&
  !!selectedCallBackgroundImageUrl.value;

const getCallBackgroundProcessorConfig = () => {
  if (selectedCallBackgroundMode.value === 'blur') {
    return {
      mode: 'background-blur' as const,
      blurRadius: 12,
      assetPaths: CALL_BACKGROUND_ASSET_PATHS
    };
  }

  return {
    mode: 'disabled' as const,
    assetPaths: CALL_BACKGROUND_ASSET_PATHS
  };
};

const getCallBackgroundProcessorSwitchOptions = () => {
  if (selectedCallBackgroundMode.value === 'blur') {
    return {
      mode: 'background-blur' as const,
      blurRadius: 12
    };
  }

  if (
    selectedCallBackgroundMode.value === 'image' &&
    selectedCallBackgroundImageUrl.value
  ) {
    return {
      mode: 'virtual-background' as const,
      imagePath: selectedCallBackgroundImageUrl.value
    };
  }

  return {
    mode: 'disabled' as const
  };
};

const isLiveKitBackgroundProcessorWrapper = (
  processor: LocalManagedVideoProcessor | null
): processor is BackgroundProcessorWrapper =>
  !!processor &&
  typeof (processor as BackgroundProcessorWrapper).switchTo === 'function';

const stopLocalBackgroundProcessor = async (): Promise<void> => {
  const activeTrack = localBackgroundProcessorTrack;
  localBackgroundProcessorTrack = null;
  localBackgroundProcessor = null;
  localBackgroundProcessorSignature = null;

  if (!activeTrack?.getProcessor()) {
    return;
  }

  try {
    await activeTrack.stopProcessor();
  } catch (error) {
    console.warn('[LiveKit] Failed to stop background processor:', error);
  }
};

const ensureLocalBackgroundProcessor = async (
  track: LocalVideoTrack
): Promise<{
  processor: LocalManagedVideoProcessor | null;
  didCreate: boolean;
}> => {
  if (localBackgroundProcessorTrack === track && localBackgroundProcessor) {
    return {
      processor: localBackgroundProcessor,
      didCreate: false
    };
  }

  if (
    localBackgroundProcessorTrack &&
    localBackgroundProcessorTrack !== track
  ) {
    await stopLocalBackgroundProcessor();
  }

  const processor = shouldUseMediapipeImageBackgroundProcessor()
    ? createMediapipeMulticlassBackgroundTrackProcessor({
        backgroundImageUrl: selectedCallBackgroundImageUrl.value || '',
        edgeBlurAmount: MULTICLASS_VIRTUAL_BACKGROUND_DEFAULTS.maskBlurRadius,
        foregroundThreshold:
          MULTICLASS_VIRTUAL_BACKGROUND_DEFAULTS.foregroundThreshold,
        maskProfile: MULTICLASS_VIRTUAL_BACKGROUND_DEFAULTS.maskProfile,
        outputFps: MANAGED_BACKGROUND_CAMERA_CAPTURE_DEFAULTS.frameRate
      })
    : BackgroundProcessor(
        getCallBackgroundProcessorConfig(),
        'call-background-processor'
      );

  await track.setProcessor(processor);
  localBackgroundProcessorTrack = track;
  localBackgroundProcessor = processor;
  localBackgroundProcessorSignature = getCallBackgroundProcessorSignature();
  return {
    processor,
    didCreate: true
  };
};

const publishCameraWithBackground = async (
  activeRoom: Room
): Promise<LocalTrackPublication | undefined> => {
  const existingPublication = Array.from(
    activeRoom.localParticipant.videoTrackPublications.values()
  ).find(item => item.source === Track.Source.Camera);

  if (existingPublication?.track) {
    await activeRoom.localParticipant.unpublishTrack(
      existingPublication.track,
      true
    );
  }

  void prewarmCallBackgroundAssets(getManagedBackgroundImageUrl());

  const localVideoTrack = await createLocalVideoTrack({
    ...MANAGED_BACKGROUND_CAMERA_CAPTURE_DEFAULTS,
    facingMode: currentCameraFacingMode
  });
  const { processor } = await ensureLocalBackgroundProcessor(localVideoTrack);

  if (!processor) {
    localVideoTrack.stop();
    throw new Error('Failed to initialize camera background processor');
  }

  await waitForLocalProcessedVideoTrack(localVideoTrack, 250);

  const publication = await activeRoom.localParticipant.publishTrack(
    localVideoTrack,
    MANAGED_BACKGROUND_CAMERA_PUBLISH_DEFAULTS
  );

  syncLocalTrackStateWhenProcessedTrackReady(localVideoTrack);

  return publication;
};

const waitForLocalProcessedVideoTrack = async (
  track: LocalVideoTrack,
  timeoutMs = 500
): Promise<MediaStreamTrack | null> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const processedTrack = track.getProcessor()?.processedTrack;

    if (processedTrack?.readyState === 'live') {
      return processedTrack;
    }

    await new Promise(resolve => {
      setTimeout(resolve, 50);
    });
  }

  return track.getProcessor()?.processedTrack || null;
};

const syncLocalTrackStateWhenProcessedTrackReady = (
  track: LocalVideoTrack,
  timeoutMs = 2500
): void => {
  void (async () => {
    const processedTrack = await waitForLocalProcessedVideoTrack(
      track,
      timeoutMs
    );

    if (
      !processedTrack ||
      !state.isVideoActive ||
      localBackgroundProcessorTrack !== track ||
      getLocalCameraTrack() !== track
    ) {
      return;
    }

    syncLocalTrackState();
  })();
};

const disableLocalCamera = async (activeRoom: Room): Promise<void> => {
  const cameraPublication = getLocalCameraPublication(activeRoom);

  if (cameraPublication?.track) {
    await activeRoom.localParticipant.unpublishTrack(
      cameraPublication.track,
      true
    );
  } else {
    await activeRoom.localParticipant.setCameraEnabled(false);
  }

  await stopLocalBackgroundProcessor();
};

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

const clearParticipantReactionTimeout = (participantId: string) => {
  const timeout = participantReactionTimeouts.get(participantId);

  if (timeout) {
    clearTimeout(timeout);
    participantReactionTimeouts.delete(participantId);
  }
};

const clearParticipantReaction = (
  participantId: string,
  shouldSyncRemoteState = true
) => {
  clearParticipantReactionTimeout(participantId);

  if (!participantReactions.value[participantId]) {
    if (getAuthUser()?.id === participantId) {
      state.activeReaction = null;
      state.activeReactionExpiresAt = null;
    }
    return false;
  }

  const nextParticipantReactions = { ...participantReactions.value };
  delete nextParticipantReactions[participantId];
  participantReactions.value = nextParticipantReactions;

  if (getAuthUser()?.id === participantId) {
    state.activeReaction = null;
    state.activeReactionExpiresAt = null;
  }

  if (shouldSyncRemoteState) {
    syncRemoteParticipantState();
  }
};

const applyParticipantReaction = (
  participantId: string,
  reaction: CallReaction,
  expiresAt = Date.now() + CALL_REACTION_DURATION_MS,
  shouldSyncRemoteState = true
) => {
  const normalizedExpiresAt =
    typeof expiresAt === 'number' && Number.isFinite(expiresAt)
      ? Math.max(expiresAt, Date.now() + 250)
      : Date.now() + CALL_REACTION_DURATION_MS;

  clearParticipantReactionTimeout(participantId);
  participantReactions.value = {
    ...participantReactions.value,
    [participantId]: {
      reaction,
      expiresAt: normalizedExpiresAt
    }
  };

  if (getAuthUser()?.id === participantId) {
    state.activeReaction = reaction;
    state.activeReactionExpiresAt = normalizedExpiresAt;
  }

  participantReactionTimeouts.set(
    participantId,
    setTimeout(
      () => {
        clearParticipantReaction(participantId);
      },
      Math.max(0, normalizedExpiresAt - Date.now())
    )
  );

  if (shouldSyncRemoteState) {
    syncRemoteParticipantState();
  }
};

const clearAllParticipantReactions = () => {
  Array.from(participantReactionTimeouts.keys()).forEach(participantId => {
    clearParticipantReactionTimeout(participantId);
  });
  participantReactions.value = {};
  state.activeReaction = null;
  state.activeReactionExpiresAt = null;
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
  if (targetTopicId) {
    const topicsApi = useTopics();
    topicsApi.topics.value = topicsApi.topics.value.map(topic =>
      topic.id === targetTopicId
        ? {
            ...topic,
            activeCall: null
          }
        : topic
    );
  }
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
  callStatusNoticeKind.value = null;
};

const clearDirectCallRecoveryTimer = () => {
  if (directCallRecoveryTimeout) {
    clearTimeout(directCallRecoveryTimeout);
    directCallRecoveryTimeout = null;
  }
};

const resetDirectCallRecoveryState = (
  preserveNotice = false,
  attemptId?: number
) => {
  if (
    typeof attemptId === 'number' &&
    attemptId !== directCallRecoveryAttemptId
  ) {
    return;
  }

  clearDirectCallRecoveryTimer();
  directCallRecoveryInFlight = false;
  directCallRecoveryDeadline = 0;
  directCallRecoveryRoomId = null;
  directCallRecoveryTopicId = null;
  directCallRecoveryWaitForRemote = false;
  directCallRecoveryAttemptId += 1;

  if (!preserveNotice && callStatusNoticeKind.value === 'reconnecting') {
    clearCallStatusNotice();
  }
};

const clearLocalAcceptState = () => {
  localAcceptRoomId = null;
  localAcceptTopicId = null;
};

const clearExplicitHangupState = () => {
  isExplicitHangupInProgress = false;
};

const isDuplicateIdentityDisconnect = (reason?: DisconnectReason): boolean =>
  reason === DisconnectReason.DUPLICATE_IDENTITY;

const showPersistentCallStatusNotice = (
  message: string,
  kind: CallStatusNoticeKind = 'reconnecting'
) => {
  clearCallStatusNotice();
  callStatusNotice.value = message;
  callStatusNoticeKind.value = kind;
  clearDialingTimeout();
  stopDialingSound();
  stopRingtone();
};

const shouldSuppressReconnectNotice = () =>
  Capacitor.isNativePlatform() && isNativeAppInBackground;

const showReconnectCallStatusNotice = () => {
  if (isExplicitHangupInProgress) {
    return;
  }

  if (shouldSuppressReconnectNotice()) {
    if (callStatusNoticeKind.value === 'reconnecting') {
      clearCallStatusNotice();
    }
    return;
  }

  showPersistentCallStatusNotice(CALL_RECONNECT_NOTICE, 'reconnecting');
};

const showTransientCallStatusNotice = (
  message: string,
  closeDelayMs = CALL_STATUS_NOTICE_CLOSE_DELAY_MS,
  kind: CallStatusNoticeKind = 'error'
) => {
  clearCallStatusNotice();
  callStatusNotice.value = message;
  callStatusNoticeKind.value = kind;
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

const applyAudioOutputState = (audioState?: AudioOutputState | null) => {
  const availableRoutes = audioState?.availableRoutes?.length
    ? audioState.availableRoutes
    : DEFAULT_AUDIO_OUTPUT_ROUTES;
  const defaultRoute = audioState?.defaultRoute || 'earpiece';
  const fallbackRoute = availableRoutes.includes(defaultRoute)
    ? defaultRoute
    : 'earpiece';
  const currentRoute =
    audioState?.currentRoute &&
    availableRoutes.includes(audioState.currentRoute)
      ? audioState.currentRoute
      : fallbackRoute;

  state.audioOutputAvailableRoutes = availableRoutes;
  state.audioOutputRoute = currentRoute;
  state.audioOutputDefaultRoute = defaultRoute;
  state.isSpeakerActive = currentRoute === 'speaker';
};

export const refreshAudioOutputRoutes = async () => {
  if (!Capacitor.isNativePlatform()) {
    applyAudioOutputState(null);
    return null;
  }

  try {
    const audioState = await AudioOutput.getState();
    applyAudioOutputState(audioState);
    return audioState;
  } catch (error) {
    console.warn('[LiveKit] Failed to read audio output routes:', error);
    applyAudioOutputState(null);
    return null;
  }
};

export const selectAudioOutputRoute = async (route: AudioOutputRoute) => {
  if (!Capacitor.isNativePlatform()) {
    const nextRoute = route === 'speaker' ? 'speaker' : 'earpiece';
    applyAudioOutputState({
      currentRoute: nextRoute,
      defaultRoute: 'earpiece',
      availableRoutes: DEFAULT_AUDIO_OUTPUT_ROUTES,
      bluetoothAvailable: false
    });
    return;
  }

  try {
    const audioState = await AudioOutput.setRoute({ route });
    applyAudioOutputState(audioState);
  } catch (error) {
    console.warn('[LiveKit] Audio output route failed:', error);
    await refreshAudioOutputRoutes();
  }
};

const handleNativeAudioRouteChanged = async (audioState: AudioOutputState) => {
  const wasBluetoothActive = state.audioOutputRoute === 'bluetooth';
  const wasBluetoothAvailable =
    state.audioOutputAvailableRoutes.includes('bluetooth');
  const isBluetoothAvailable = audioState.availableRoutes.includes('bluetooth');

  if (wasBluetoothActive && !isBluetoothAvailable) {
    await selectAudioOutputRoute('earpiece');
    return;
  }

  if (open.value && !wasBluetoothAvailable && isBluetoothAvailable) {
    await selectAudioOutputRoute('bluetooth');
    return;
  }

  applyAudioOutputState(audioState);
};

const setupAudioOutputRouteListener = () => {
  if (
    !Capacitor.isNativePlatform() ||
    isAudioOutputRouteListenerBound ||
    audioOutputRouteListener
  ) {
    return;
  }

  isAudioOutputRouteListenerBound = true;
  AudioOutput.addListener('audioRouteChanged', audioState => {
    void handleNativeAudioRouteChanged(audioState);
  })
    .then(listener => {
      audioOutputRouteListener = listener;
    })
    .catch(error => {
      isAudioOutputRouteListenerBound = false;
      console.warn('[LiveKit] Failed to listen audio output routes:', error);
    });
};

const applyDefaultAudioOutputRoute = async () => {
  await selectAudioOutputRoute('auto');
};

const isGroupCallSession = (targetTopicId?: string | null): boolean => {
  const activeTopicId = targetTopicId ?? topicId.value;
  const activeTopic = activeTopicId
    ? (useTopics().getSelectedTopic(activeTopicId) as any)
    : null;

  return !!(
    activeTopic?.type === TopicType.Group ||
    activeTopic?.activeCall?.groupMode ||
    invitedGroupCall.value
  );
};

const isRecoverableDirectCallSession = (
  targetRoomId?: string | null,
  targetTopicId?: string | null
): boolean => {
  const activeRoomId = targetRoomId ?? roomId.value;
  const activeTopicId = targetTopicId ?? topicId.value;
  const activeTopic = activeTopicId
    ? (useTopics().getSelectedTopic(activeTopicId) as any)
    : null;
  const matchesCurrentCall =
    (!!activeRoomId && roomId.value === activeRoomId) ||
    (!!targetTopicId && topicId.value === targetTopicId);
  const isInvitedGroupSession =
    invitedGroupCall.value?.roomId === activeRoomId ||
    invitedGroupCall.value?.topicId === activeTopicId;
  const knownParticipantCount =
    activeTopic?.activeCall?.participantCount ??
    (roomId.value === activeRoomId && topicId.value === activeTopicId && room
      ? room.remoteParticipants.size + 1
      : 0);

  return !!(
    matchesCurrentCall &&
    !isIncoming.value &&
    activeTopicId &&
    activeTopic?.type === TopicType.DM &&
    !isInvitedGroupSession &&
    !activeTopic?.activeCall?.groupMode &&
    knownParticipantCount <= 2
  );
};

const resolveDirectCallRecoverySuccess = (activeRoom: Room | null = room) => {
  if (!directCallRecoveryRoomId || !directCallRecoveryTopicId) {
    return;
  }

  const recovered =
    !!activeRoom &&
    roomId.value === directCallRecoveryRoomId &&
    topicId.value === directCallRecoveryTopicId &&
    activeRoom.remoteParticipants.size > 0;

  if (!recovered) {
    return;
  }

  resetDirectCallRecoveryState();
  syncConnectionState(activeRoom);
};

const scheduleDirectCallRecoveryAttempt = (attemptId: number) => {
  clearDirectCallRecoveryTimer();
  directCallRecoveryTimeout = setTimeout(() => {
    directCallRecoveryTimeout = null;

    if (attemptId !== directCallRecoveryAttemptId) {
      return;
    }

    void recoverDirectCallConnection(attemptId);
  }, DIRECT_CALL_RECONNECT_POLL_MS);
};

const recoverDirectCallConnection = async (
  attemptId = directCallRecoveryAttemptId
) => {
  if (attemptId !== directCallRecoveryAttemptId || directCallRecoveryInFlight) {
    return;
  }

  const activeRoomId = directCallRecoveryRoomId ?? roomId.value;
  const activeTopicId = directCallRecoveryTopicId ?? topicId.value;

  if (
    !activeRoomId ||
    !activeTopicId ||
    !isRecoverableDirectCallSession(activeRoomId, activeTopicId)
  ) {
    resetDirectCallRecoveryState();
    return;
  }

  directCallRecoveryInFlight = true;

  try {
    const status = await getRawLiveKitCallStatus(activeRoomId);

    if (attemptId !== directCallRecoveryAttemptId) {
      return;
    }

    if (!status) {
      if (Date.now() >= directCallRecoveryDeadline) {
        resetDirectCallRecoveryState(true, attemptId);
        clearUnavailableCallState(activeRoomId, activeTopicId);
        showTransientCallStatusNotice(
          DIRECT_CALL_ENDED_NOTICE,
          ENDED_CALL_STATUS_NOTICE_CLOSE_DELAY_MS,
          'ended'
        );
        return;
      }

      scheduleDirectCallRecoveryAttempt(attemptId);
      return;
    }

    if (status.topicId && status.topicId !== activeTopicId) {
      resetDirectCallRecoveryState(true, attemptId);
      showTransientCallStatusNotice(DIRECT_CALL_RECONNECT_FAILED_NOTICE);
      return;
    }

    if (!status?.active) {
      if (
        directCallRecoveryWaitForRemote ||
        remoteReconnectingParticipants.size > 0
      ) {
        if (Date.now() >= directCallRecoveryDeadline) {
          resetDirectCallRecoveryState(true, attemptId);
          clearUnavailableCallState(activeRoomId, activeTopicId);
          showTransientCallStatusNotice(
            DIRECT_CALL_ENDED_NOTICE,
            ENDED_CALL_STATUS_NOTICE_CLOSE_DELAY_MS,
            'ended'
          );
          return;
        }

        scheduleDirectCallRecoveryAttempt(attemptId);
        return;
      }

      resetDirectCallRecoveryState(true, attemptId);
      clearUnavailableCallState(activeRoomId, activeTopicId);
      showTransientCallStatusNotice(
        DIRECT_CALL_ENDED_NOTICE,
        ENDED_CALL_STATUS_NOTICE_CLOSE_DELAY_MS,
        'ended'
      );
      return;
    }

    if (room) {
      resolveDirectCallRecoverySuccess(room);

      if (attemptId !== directCallRecoveryAttemptId) {
        return;
      }
    }

    if (room?.remoteParticipants.size) {
      resolveDirectCallRecoverySuccess(room);
      return;
    }

    if (!room && !connectPromise) {
      try {
        await connectToRoom();
      } catch (error) {
        console.warn('[LiveKit] Failed to reconnect direct call:', error);
      }
    }

    if (attemptId !== directCallRecoveryAttemptId) {
      return;
    }

    if (room) {
      resolveDirectCallRecoverySuccess(room);

      if (attemptId !== directCallRecoveryAttemptId) {
        return;
      }
    }

    if (room?.remoteParticipants.size) {
      resolveDirectCallRecoverySuccess(room);
      return;
    }

    if (Date.now() >= directCallRecoveryDeadline) {
      resetDirectCallRecoveryState(true, attemptId);
      showTransientCallStatusNotice(
        DIRECT_CALL_ENDED_NOTICE,
        ENDED_CALL_STATUS_NOTICE_CLOSE_DELAY_MS,
        'ended'
      );
      return;
    }

    scheduleDirectCallRecoveryAttempt(attemptId);
  } finally {
    if (attemptId === directCallRecoveryAttemptId) {
      directCallRecoveryInFlight = false;
    }
  }
};

const startDirectCallRecovery = (
  targetRoomId?: string | null,
  targetTopicId?: string | null,
  options: DirectCallRecoveryOptions = {}
): boolean => {
  if (isExplicitHangupInProgress) {
    return false;
  }

  const activeRoomId = targetRoomId ?? roomId.value;
  const activeTopicId = targetTopicId ?? topicId.value;

  if (
    !activeRoomId ||
    !activeTopicId ||
    !isRecoverableDirectCallSession(activeRoomId, activeTopicId)
  ) {
    return false;
  }

  directCallRecoveryAttemptId += 1;
  directCallRecoveryInFlight = false;
  directCallRecoveryDeadline = Date.now() + DIRECT_CALL_RECONNECT_GRACE_MS;
  directCallRecoveryRoomId = activeRoomId;
  directCallRecoveryTopicId = activeTopicId;
  directCallRecoveryWaitForRemote =
    !!options.waitForRemote || remoteReconnectingParticipants.size > 0;
  shouldEndCallOnConnectFailure = false;
  showReconnectCallStatusNotice();
  ensureCallTimerContinues();
  isCalling.value = false;
  open.value = true;
  isModalVisible.value = true;
  clearDirectCallRecoveryTimer();
  void recoverDirectCallConnection(directCallRecoveryAttemptId);
  return true;
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

  if (!sdk || !me || !targetRoomId) {
    return false;
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
  if (!targetRoomId) {
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

const getRawLiveKitCallStatus = async (
  targetRoomId?: string | null
): Promise<LiveKitCallStatus | null> => {
  if (!targetRoomId) {
    return null;
  }

  const sdk = getChatSDK();
  if (!sdk) {
    return null;
  }

  const status = await sdk.getLiveKitCallStatus(targetRoomId);
  if (!status) {
    return null;
  }

  return status;
};

const getLiveKitCallStatus = async (
  targetRoomId?: string | null,
  targetTopicId?: string | null
): Promise<LiveKitCallStatus | null> => {
  const status = await getRawLiveKitCallStatus(targetRoomId);

  if (!status) {
    return null;
  }

  if (status.active !== true) {
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
          startTime: startTime ?? status.startTime ?? null,
          participantCount: status.participantCount,
          groupMode: status.groupMode,
          elapsedDurationMs: status.elapsedDurationMs
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

  const invite = parseGroupCallInviteUrl(window.location.href);

  if (!invite) {
    return null;
  }

  return {
    roomId: invite.roomId,
    inviteToken: invite.inviteToken
  };
};

const buildInviteUrl = (invite: {
  roomId: string;
  inviteToken: string;
}): string => {
  const currentUrl = new URL(window.location.href);
  const url = new URL(window.location.origin);
  url.searchParams.set('callRoom', invite.roomId);
  url.searchParams.set('callInvite', invite.inviteToken);

  const organization = currentUrl.searchParams.get('organization');
  if (organization) {
    url.searchParams.set('organization', organization);
  }

  return url.toString();
};

const clearInviteParamsFromUrl = () => {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  url.searchParams.delete('callInvite');
  url.searchParams.delete('callRoom');
  window.history.replaceState({}, document.title, url.toString());
};

const handleExpiredInviteLink = () => {
  removeInvitedGroupCallEntry();
  clearInviteParamsFromUrl();
  showNotification({
    title: 'Ссылка недействительна',
    description: 'Ссылка на звонок больше не действует.',
    type: MessageTypeEnum.error
  });
};

const formattedTime = computed(() => formatTime(timerSeconds.value));

const getElapsedCallDurationMs = () =>
  callElapsedMs.value +
  (callStartedAt.value ? Date.now() - callStartedAt.value : 0);

const syncTimerValue = () => {
  timerSeconds.value = Math.max(
    0,
    Math.floor(getElapsedCallDurationMs() / 1000)
  );
};

const setCallStartedAt = (
  startTime?: number | null,
  elapsedMs = callElapsedMs.value
) => {
  callElapsedMs.value = Math.max(0, elapsedMs);
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

const ensureCallTimerContinues = () => {
  if (!callStartedAt.value) {
    callStartedAt.value = Date.now();
  }

  startTimer();
};

const pauseTimer = (elapsedMs = getElapsedCallDurationMs()) => {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  setCallStartedAt(null, elapsedMs);
};

const resetTimer = () => {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  setCallStartedAt(null, 0);
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

const getDialingAudioContext = () => {
  if (dialingAudioContext) {
    return dialingAudioContext;
  }

  const AudioContextCtor =
    window.AudioContext ||
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

  if (!AudioContextCtor) {
    return null;
  }

  dialingAudioContext = new AudioContextCtor();
  return dialingAudioContext;
};

const loadDialingAudioBuffer = async () => {
  if (dialingAudioBuffer) {
    return dialingAudioBuffer;
  }

  const context = getDialingAudioContext();

  if (!context) {
    return null;
  }

  const response = await fetch('/audio/dialing.mp3');
  const audioArrayBuffer = await response.arrayBuffer();
  dialingAudioBuffer = await context.decodeAudioData(audioArrayBuffer);

  return dialingAudioBuffer;
};

const startDialingBufferLoop = async () => {
  const context = getDialingAudioContext();
  const buffer = await loadDialingAudioBuffer();

  if (!context || !buffer || !isCalling.value) {
    return;
  }

  if (context.state === 'suspended') {
    await context.resume();
  }

  if (dialingAudioSource) {
    return;
  }

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(context.destination);
  source.onended = () => {
    if (dialingAudioSource === source) {
      dialingAudioSource = null;
    }
  };
  source.start(0);
  dialingAudioSource = source;
};

const stopDialingBufferLoop = () => {
  if (!dialingAudioSource) {
    return;
  }

  dialingAudioSource.onended = null;
  dialingAudioSource.stop();
  dialingAudioSource.disconnect();
  dialingAudioSource = null;
};

const ensureDialingSoundPlayback = () => {
  if (dialingAudioSource) {
    return;
  }

  if (dialingAudioStartPromise) {
    return;
  }

  dialingAudioStartPromise = (async () => {
    try {
      await startDialingBufferLoop();
    } catch (error) {
      if (!dialingAudio) {
        dialingAudio = new Audio('/audio/dialing.mp3');
        dialingAudio.preload = 'auto';
        dialingAudio.loop = true;
      }

      if (dialingAudio.paused || dialingAudio.ended) {
        dialingAudio.currentTime = 0;
        await dialingAudio.play().catch(err => {
          console.warn('[LiveKit] Dialing failed:', err);
        });
      }

      console.warn(
        '[LiveKit] Dialing buffer failed, fallback to audio tag:',
        error
      );
    } finally {
      dialingAudioStartPromise = null;
    }
  })();
};

const playDialingSound = () => {
  ensureDialingSoundPlayback();

  if (dialingSoundWatchdogInterval) {
    clearInterval(dialingSoundWatchdogInterval);
  }

  dialingSoundWatchdogInterval = setInterval(() => {
    if (!isCalling.value || !dialingAudio) {
      return;
    }

    ensureDialingSoundPlayback();
  }, 1500);
};

const stopDialingSound = () => {
  if (dialingSoundWatchdogInterval) {
    clearInterval(dialingSoundWatchdogInterval);
    dialingSoundWatchdogInterval = null;
  }

  dialingAudioStartPromise = null;
  stopDialingBufferLoop();

  if (!dialingAudio) return;
  dialingAudio.onpause = null;
  dialingAudio.onended = null;
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
    state.isScreenSharingActive = false;
    if (isAndroidScreenSharePlatform()) {
      void stopAndroidScreenShare();
    }
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
  state.isScreenSharingActive = !!localScreenTrack?.mediaStreamTrack;
  if (!state.isScreenSharingActive && isAndroidScreenSharePlatform()) {
    void stopAndroidScreenShare();
  }
  const localProcessedVideoTrack =
    localVideoTrack instanceof LocalVideoTrack
      ? localVideoTrack.getProcessor()?.processedTrack ||
        localVideoTrack.mediaStreamTrack
      : localVideoTrack?.mediaStreamTrack;
  const shouldHideUnprocessedLocalVideo =
    selectedCallBackgroundMode.value !== 'none' &&
    state.isVideoActive &&
    localVideoTrack instanceof LocalVideoTrack &&
    !localVideoTrack.getProcessor()?.processedTrack;

  if (localScreenTrack?.mediaStreamTrack) {
    localScreenTrack.mediaStreamTrack.onended = () => {
      if (state.isScreenSharingActive && !isStoppingAndroidScreenShare) {
        void toggleScreenShare();
      }
    };
  }

  localVideoStream.value = getCachedSingleTrackStream(
    localTrackStreamCache,
    'local-camera',
    shouldHideUnprocessedLocalVideo ? null : localProcessedVideoTrack
  );
  localScreenShareStream.value = getCachedSingleTrackStream(
    localTrackStreamCache,
    'local-screen-share',
    localScreenTrack?.mediaStreamTrack
  );
};

const syncLocalCallBackgroundProcessor = async (): Promise<void> => {
  const localCameraTrack = getLocalCameraTrack();
  if (!localCameraTrack || !state.isVideoActive) {
    await stopLocalBackgroundProcessor();
    hasShownBackgroundProcessorSupportError = false;
    syncLocalTrackState();
    return;
  }

  if (selectedCallBackgroundMode.value === 'none') {
    await stopLocalBackgroundProcessor();
    hasShownBackgroundProcessorSupportError = false;
    syncLocalTrackState();
    return;
  }

  hasShownBackgroundProcessorSupportError = false;

  try {
    const nextSignature = getCallBackgroundProcessorSignature();
    let processor = localBackgroundProcessor;
    let didCreate = false;

    if (!processor || localBackgroundProcessorTrack !== localCameraTrack) {
      ({ processor, didCreate } =
        await ensureLocalBackgroundProcessor(localCameraTrack));
    } else if (localBackgroundProcessorSignature !== nextSignature) {
      if (
        shouldUseMediapipeImageBackgroundProcessor() ||
        !isLiveKitBackgroundProcessorWrapper(processor)
      ) {
        await stopLocalBackgroundProcessor();
        ({ processor, didCreate } =
          await ensureLocalBackgroundProcessor(localCameraTrack));
      } else {
        await processor.switchTo(getCallBackgroundProcessorSwitchOptions());
        localBackgroundProcessorSignature = nextSignature;
      }
    }

    if (!processor) {
      return;
    }

    if (!didCreate && localBackgroundProcessorSignature === nextSignature) {
      if (!localCameraTrack.getProcessor()?.processedTrack) {
        syncLocalTrackStateWhenProcessedTrackReady(localCameraTrack);
      }

      syncLocalTrackState();
      return;
    }

    await waitForLocalProcessedVideoTrack(localCameraTrack);
    syncLocalTrackStateWhenProcessedTrackReady(localCameraTrack);

    hasShownBackgroundProcessorSupportError = false;
    syncLocalTrackState();
  } catch (error) {
    console.warn('[LiveKit] Failed to apply call background processor:', error);
    if (!hasShownBackgroundProcessorSupportError) {
      hasShownBackgroundProcessorSupportError = true;
      showErrorNotification('Не удалось применить фон для звонка');
    }
  }
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

const getRemoteVideoPublicationBySource = (
  participantIdentity: string,
  source: RemoteVideoSource
) => {
  const remoteParticipant = room?.remoteParticipants.get(participantIdentity);

  if (!remoteParticipant) {
    return null;
  }

  return (
    Array.from(remoteParticipant.videoTrackPublications.values()).find(
      publication =>
        publication.source ===
        (source === 'screen' ? Track.Source.ScreenShare : Track.Source.Camera)
    ) || null
  );
};

const buildRequestedVideoDimensions = (element: HTMLVideoElement) => {
  const rect = element.getBoundingClientRect();
  const pixelDensity =
    typeof window !== 'undefined'
      ? Math.min(window.devicePixelRatio || 1, 2)
      : 1;
  const width = Math.round(
    (rect.width || element.clientWidth || 0) * pixelDensity
  );
  const height = Math.round(
    (rect.height || element.clientHeight || 0) * pixelDensity
  );

  if (!width || !height) {
    return null;
  }

  return { width, height };
};

const applyRemoteVideoSubscriptionPreferences = (
  participantIdentity: string,
  source: RemoteVideoSource,
  element?: HTMLVideoElement | null
) => {
  const publication = getRemoteVideoPublicationBySource(
    participantIdentity,
    source
  );

  if (!publication) {
    return;
  }

  publication.setEnabled(true);
  publication.setVideoFPS(source === 'screen' ? 30 : 24);

  const dimensions = element ? buildRequestedVideoDimensions(element) : null;

  if (dimensions) {
    publication.setVideoDimensions(dimensions);
    return;
  }

  publication.setVideoQuality(VideoQuality.HIGH);
};

const requestHighQualityForAllRemoteVideoTracks = () => {
  if (!room) {
    return;
  }

  Array.from(room.remoteParticipants.values()).forEach(remoteParticipant => {
    applyRemoteVideoSubscriptionPreferences(
      remoteParticipant.identity,
      'screen'
    );
    applyRemoteVideoSubscriptionPreferences(
      remoteParticipant.identity,
      'camera'
    );
  });
};

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
    activeReaction:
      participantReactions.value[remoteParticipant.identity]?.reaction || null,
    activeReactionExpiresAt:
      participantReactions.value[remoteParticipant.identity]?.expiresAt || null,
    isSpeaking: !!remoteParticipant.isSpeaking,
    audioLevel: remoteParticipant.audioLevel || 0,
    isMicActive: !!audioPublication?.track?.mediaStreamTrack,
    connectionQuality:
      remoteParticipant.connectionQuality || ConnectionQuality.Unknown
  };
};

const syncRemoteParticipantSpeakingState = () => {
  if (!room || !remoteParticipants.value.length) {
    return;
  }

  const remoteAudioLevels = new Map(
    Array.from(room.remoteParticipants.values()).map(participant => [
      participant.identity,
      {
        isSpeaking: !!participant.isSpeaking,
        audioLevel: participant.audioLevel || 0,
        connectionQuality:
          participant.connectionQuality || ConnectionQuality.Unknown
      }
    ])
  );

  remoteParticipants.value = remoteParticipants.value.map(participant => ({
    ...participant,
    isSpeaking:
      remoteAudioLevels.get(participant.identity)?.isSpeaking || false,
    audioLevel: remoteAudioLevels.get(participant.identity)?.audioLevel || 0,
    connectionQuality:
      remoteAudioLevels.get(participant.identity)?.connectionQuality ||
      participant.connectionQuality ||
      ConnectionQuality.Unknown
  }));
};

const syncLocalParticipantSpeakingState = (activeRoom?: Room | null) => {
  const localParticipant = activeRoom?.localParticipant;

  state.isSpeaking = !!localParticipant?.isSpeaking;
  state.audioLevel = localParticipant?.audioLevel || 0;
  state.connectionQuality =
    localParticipant?.connectionQuality || ConnectionQuality.Unknown;
};

const clearRemoteReconnectingParticipant = (identity: string) => {
  const entry = remoteReconnectingParticipants.get(identity);

  if (!entry) {
    return;
  }

  clearTimeout(entry.timeout);
  remoteReconnectingParticipants.delete(identity);
};

const clearRemoteReconnectingParticipants = () => {
  remoteReconnectingParticipants.forEach(entry => {
    clearTimeout(entry.timeout);
  });
  remoteReconnectingParticipants.clear();
};

const clearRemoteExplicitlyLeftParticipant = (identity: string) => {
  const timeout = remoteExplicitlyLeftParticipants.get(identity);

  if (timeout) {
    clearTimeout(timeout);
  }

  remoteExplicitlyLeftParticipants.delete(identity);
};

const clearRemoteExplicitlyLeftParticipants = () => {
  remoteExplicitlyLeftParticipants.forEach(timeout => {
    clearTimeout(timeout);
  });
  remoteExplicitlyLeftParticipants.clear();
};

const markRemoteParticipantExplicitlyLeft = (identity: string) => {
  clearRemoteExplicitlyLeftParticipant(identity);
  remoteExplicitlyLeftParticipants.set(
    identity,
    setTimeout(() => {
      remoteExplicitlyLeftParticipants.delete(identity);
    }, DIRECT_CALL_EXPLICIT_LEAVE_SUPPRESSION_MS)
  );
};

const shouldKeepRemoteParticipantForReconnect = (): boolean =>
  isRecoverableDirectCallSession(roomId.value, topicId.value);

const setRemoteReconnectingParticipant = (
  participant: ParticipantMediaState
) => {
  if (!shouldKeepRemoteParticipantForReconnect()) {
    clearRemoteReconnectingParticipant(participant.identity);
    return;
  }

  clearRemoteReconnectingParticipant(participant.identity);

  const timeout = setTimeout(() => {
    remoteReconnectingParticipants.delete(participant.identity);
    syncRemoteParticipantState();
  }, DIRECT_CALL_RECONNECT_GRACE_MS);

  remoteReconnectingParticipants.set(participant.identity, {
    participant,
    timeout
  });
};

const buildRemoteReconnectingParticipantState = (
  participant: Participant | RemoteParticipant
): ParticipantMediaState => {
  const previousParticipant =
    remoteParticipants.value.find(
      item => item.identity === participant.identity
    )?.name ||
    remoteReconnectingParticipants.get(participant.identity)?.participant
      .name ||
    participant.name ||
    participant.identity;

  return {
    identity: participant.identity,
    name: previousParticipant,
    videoStream: null,
    cameraStream: null,
    screenShareStream: null,
    audioStream: null,
    isVideoActive: false,
    isScreenShareActive: false,
    isHandRaised: false,
    activeReaction: null,
    activeReactionExpiresAt: null,
    isSpeaking: false,
    audioLevel: 0,
    isMicActive: false,
    connectionQuality: ConnectionQuality.Poor
  };
};

const markRemoteParticipantReconnecting = (
  participant: Participant | RemoteParticipant
) => {
  if (
    remoteExplicitlyLeftParticipants.has(participant.identity) ||
    !shouldKeepRemoteParticipantForReconnect()
  ) {
    clearRemoteReconnectingParticipant(participant.identity);
    return;
  }

  setRemoteReconnectingParticipant(
    buildRemoteReconnectingParticipantState(participant)
  );
};

const syncRemoteParticipantState = () => {
  const activeRoom = room;
  const shouldShowReconnectingParticipants =
    shouldKeepRemoteParticipantForReconnect();

  if (!shouldShowReconnectingParticipants) {
    clearRemoteReconnectingParticipants();
  }

  if (!activeRoom) {
    if (
      shouldShowReconnectingParticipants &&
      directCallRecoveryRoomId &&
      remoteReconnectingParticipants.size > 0
    ) {
      remoteTrackStreamCache.clear();
      remoteParticipants.value = Array.from(
        remoteReconnectingParticipants.values()
      ).map(entry => entry.participant);
      isRemoteVideoActive.value = false;
      return;
    }

    clearRemoteReconnectingParticipants();
    remoteTrackStreamCache.clear();
    remoteParticipants.value = [];
    isRemoteVideoActive.value = false;
    return;
  }

  const nextRemoteParticipants = Array.from(
    activeRoom.remoteParticipants.values()
  )
    .filter(
      participant => !remoteExplicitlyLeftParticipants.has(participant.identity)
    )
    .map(buildRemoteParticipantState);
  const activeParticipantIds = new Set(
    nextRemoteParticipants.map(participant => participant.identity)
  );

  activeParticipantIds.forEach(identity => {
    clearRemoteReconnectingParticipant(identity);
  });

  const reconnectingParticipants = shouldShowReconnectingParticipants
    ? Array.from(remoteReconnectingParticipants.values())
        .map(entry => entry.participant)
        .filter(participant => !activeParticipantIds.has(participant.identity))
    : [];
  const displayedRemoteParticipants = [
    ...nextRemoteParticipants,
    ...reconnectingParticipants
  ];

  pruneRemoteTrackStreamCache(
    nextRemoteParticipants.map(participant => participant.identity)
  );
  remoteParticipants.value = displayedRemoteParticipants;

  isRemoteVideoActive.value = remoteParticipants.value.some(
    participant => participant.isVideoActive
  );
};

const clearPendingAudioRecoveryTimeouts = () => {
  pendingAudioRecoveryTimeouts.forEach(timeout => {
    clearTimeout(timeout);
  });
  pendingAudioRecoveryTimeouts.clear();
};

const getRemoteAudioPublicationKey = (
  participantIdentity: string,
  publication: {
    source?: Track.Source;
    trackSid?: string;
    sid?: string;
  }
) =>
  `${participantIdentity}:${publication.trackSid || publication.sid || publication.source || 'microphone'}`;

const clearPendingRemoteAudioResubscribeTimeout = (
  participantIdentity: string,
  publication: {
    source?: Track.Source;
    trackSid?: string;
    sid?: string;
  }
) => {
  const key = getRemoteAudioPublicationKey(participantIdentity, publication);
  const timeout = pendingRemoteAudioResubscribeTimeouts.get(key);

  if (!timeout) {
    return;
  }

  clearTimeout(timeout);
  pendingRemoteAudioResubscribeTimeouts.delete(key);
};

const clearPendingRemoteAudioResubscribeTimeouts = (
  participantIdentity?: string
) => {
  Array.from(pendingRemoteAudioResubscribeTimeouts.entries()).forEach(
    ([key, timeout]) => {
      if (participantIdentity && !key.startsWith(`${participantIdentity}:`)) {
        return;
      }

      clearTimeout(timeout);
      pendingRemoteAudioResubscribeTimeouts.delete(key);
    }
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

const publishCallReaction = async (reaction: CallReaction) => {
  if (!room) return;

  const expiresAt = Date.now() + CALL_REACTION_DURATION_MS;
  const payload = new TextEncoder().encode(
    JSON.stringify({
      type: CALL_REACTION_TOPIC,
      reaction,
      expiresAt
    })
  );

  await room.localParticipant.publishData(payload, {
    reliable: true,
    topic: CALL_REACTION_TOPIC
  });

  const authUser = getAuthUser();

  if (authUser?.id) {
    applyParticipantReaction(authUser.id, reaction, expiresAt, false);
  }
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

const handleCallReactionData = (
  payload: Uint8Array,
  participant?: RemoteParticipant,
  topic?: string
) => {
  if (!participant || topic !== CALL_REACTION_TOPIC) return;

  try {
    const parsedPayload = JSON.parse(new TextDecoder().decode(payload)) as {
      type?: string;
      reaction?: CallReaction;
      expiresAt?: number;
    };

    if (
      parsedPayload.type !== CALL_REACTION_TOPIC ||
      !parsedPayload.reaction ||
      !['heart', 'thumbs-up', 'thumbs-down', 'joy', 'sob'].includes(
        parsedPayload.reaction
      )
    ) {
      return;
    }

    applyParticipantReaction(
      participant.identity,
      parsedPayload.reaction,
      parsedPayload.expiresAt
    );
  } catch (error) {
    console.warn('[LiveKit] Failed to parse reaction event:', error);
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

const applyLocalMicrophoneVoiceIsolation = async (
  publication?: LocalTrackPublication
): Promise<void> => {
  const microphoneTrack = publication?.track?.mediaStreamTrack;

  if (!microphoneTrack || microphoneTrack.readyState !== 'live') {
    return;
  }

  microphoneTrack.contentHint = 'speech';

  try {
    await microphoneTrack.applyConstraints(CALL_AUDIO_CAPTURE_DEFAULTS);
  } catch (error) {
    console.warn(
      '[LiveKit] Failed to apply microphone voice isolation constraints:',
      error
    );
  }
};

const setLocalMicrophoneEnabled = async (
  activeRoom: Room,
  enabled: boolean
): Promise<LocalTrackPublication | undefined> => {
  const publication = await activeRoom.localParticipant.setMicrophoneEnabled(
    enabled,
    CALL_AUDIO_CAPTURE_DEFAULTS
  );

  await applyLocalMicrophoneVoiceIsolation(publication);

  return publication;
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

  await setLocalMicrophoneEnabled(activeRoom, true);
};

const repairRemoteAudioPublication = (
  participantIdentity: string,
  publication: {
    source?: Track.Source;
    isMuted?: boolean;
    isSubscribed?: boolean;
    track?: { mediaStreamTrack?: MediaStreamTrack | null } | null;
    setEnabled: (enabled: boolean) => void;
    setSubscribed?: (subscribed: boolean) => void;
    trackSid?: string;
    sid?: string;
  }
) => {
  if (publication.source !== Track.Source.Microphone) {
    return;
  }

  publication.setEnabled(true);

  const mediaTrack = publication.track?.mediaStreamTrack;
  const hasLiveTrack = !!mediaTrack && mediaTrack.readyState === 'live';

  if (hasLiveTrack) {
    clearPendingRemoteAudioResubscribeTimeout(participantIdentity, publication);
    if (publication.isSubscribed === false) {
      publication.setSubscribed?.(true);
    }
    return;
  }

  if (publication.isMuted) {
    clearPendingRemoteAudioResubscribeTimeout(participantIdentity, publication);
    return;
  }

  if (publication.isSubscribed === false) {
    publication.setSubscribed?.(true);
  }

  if (typeof publication.setSubscribed !== 'function') {
    return;
  }

  const key = getRemoteAudioPublicationKey(participantIdentity, publication);
  if (pendingRemoteAudioResubscribeTimeouts.has(key)) {
    return;
  }

  try {
    publication.setSubscribed(false);
  } catch (error) {
    console.warn('[LiveKit] Failed to unsubscribe remote audio track:', error);
  }

  const timeout = setTimeout(() => {
    pendingRemoteAudioResubscribeTimeouts.delete(key);

    try {
      publication.setSubscribed?.(true);
    } catch (error) {
      console.warn(
        '[LiveKit] Failed to resubscribe remote audio track:',
        error
      );
    }
  }, 250);

  pendingRemoteAudioResubscribeTimeouts.set(key, timeout);
};

const ensureRemoteAudioSubscriptions = (activeRoom: Room | null = room) => {
  if (!activeRoom) {
    return;
  }

  Array.from(activeRoom.remoteParticipants.values()).forEach(
    remoteParticipant => {
      remoteParticipant.audioTrackPublications.forEach(publication => {
        repairRemoteAudioPublication(remoteParticipant.identity, publication);
      });
    }
  );
};

const recoverCallAudioState = async (
  activeRoom: Room | null = room
): Promise<void> => {
  if (!activeRoom) {
    return;
  }

  ensureRemoteAudioSubscriptions(activeRoom);
  await ensureLocalMicrophoneState(activeRoom);
  syncRemoteParticipantState();
  syncConnectionState(activeRoom);
};

const scheduleCallAudioRecovery = (activeRoom: Room | null = room): void => {
  if (!activeRoom) {
    return;
  }

  [0, 400, 1500].forEach(delayMs => {
    const timeout = setTimeout(() => {
      pendingAudioRecoveryTimeouts.delete(timeout);

      if (room !== activeRoom) {
        return;
      }

      void recoverCallAudioState(activeRoom);
    }, delayMs);

    pendingAudioRecoveryTimeouts.add(timeout);
  });
};

const syncConnectionState = (activeRoom: Room) => {
  const hasRemoteParticipant = activeRoom.remoteParticipants.size > 0;

  isIncoming.value = false;

  if (
    directCallRecoveryRoomId ||
    callStatusNoticeKind.value === 'reconnecting'
  ) {
    isCalling.value = false;
    ensureCallTimerContinues();
    stopDialingSound();
    stopRingtone();
    return;
  }

  if (callStartedAt.value) {
    startTimer();
  } else {
    pauseTimer();
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

const getPresenceAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const AudioContextCtor =
    window.AudioContext ||
    ((window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext as typeof AudioContext | undefined);

  if (!AudioContextCtor) {
    return null;
  }

  if (!presenceAudioContext) {
    presenceAudioContext = new AudioContextCtor();
  }

  return presenceAudioContext;
};

const schedulePresenceTone = (
  audioContext: AudioContext,
  startAt: number,
  frequency: number,
  durationSeconds: number,
  gainValue: number
): number => {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  const endAt = startAt + durationSeconds;

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gainNode.gain.setValueAtTime(0.0001, startAt);
  gainNode.gain.linearRampToValueAtTime(gainValue, startAt + 0.015);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, endAt);

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start(startAt);
  oscillator.stop(endAt + 0.02);

  return endAt;
};

const playPresenceTonePattern = async (
  type: 'joined' | 'left'
): Promise<boolean> => {
  const audioContext = getPresenceAudioContext();

  if (!audioContext) {
    return false;
  }

  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
    } catch (error) {
      console.warn('[LiveKit] Failed to resume presence audio context:', error);
      return false;
    }
  }

  let cursor = audioContext.currentTime + 0.01;

  if (type === 'joined') {
    cursor = schedulePresenceTone(audioContext, cursor, 740, 0.08, 0.162);
    schedulePresenceTone(audioContext, cursor + 0.04, 988, 0.11, 0.164);
    return true;
  }

  cursor = schedulePresenceTone(audioContext, cursor, 660, 0.1, 0.16);
  schedulePresenceTone(audioContext, cursor + 0.03, 523.25, 0.12, 0.158);
  return true;
};

const playGroupCallPresenceSound = async (
  type: 'joined' | 'left'
): Promise<void> => {
  if (!(await shouldPlayNotificationSound())) {
    return;
  }

  const didPlayPresenceTone = await playPresenceTonePattern(type);

  if (didPlayPresenceTone) {
    return;
  }

  try {
    await playNativeNotificationSound();
  } catch (error) {
    console.warn('[LiveKit] Failed to play presence sound:', error);
  }
};

const isGroupCallPresenceNotificationEnabled = (activeRoom?: Room): boolean => {
  const activeTopic = topicId.value
    ? (useTopics().getSelectedTopic(topicId.value) as any)
    : null;

  return !!(
    activeTopic?.type === TopicType.Group ||
    activeTopic?.activeCall?.groupMode ||
    invitedGroupCall.value?.topicId ||
    (activeRoom?.remoteParticipants.size ?? 0) > 1
  );
};

const resolveParticipantDisplayName = (
  participant: Participant | RemoteParticipant
): string => {
  const activeTopic = topicId.value
    ? (useTopics().getSelectedTopic(topicId.value) as any)
    : null;
  const topicMember =
    activeTopic?.members?.find?.(
      (member: IUser) => member?.id === participant.identity
    ) || null;

  return (
    topicMember?.initials ||
    topicMember?.nickname ||
    participant.name ||
    participant.identity
  );
};

const showGroupCallPresenceNotification = (
  participant: Participant | RemoteParticipant,
  action: 'joined' | 'left',
  activeRoom?: Room
): void => {
  if (
    suppressParticipantPresenceNotifications ||
    !isGroupCallPresenceNotificationEnabled(activeRoom)
  ) {
    return;
  }

  showNotification({
    title: resolveParticipantDisplayName(participant),
    description:
      action === 'joined' ? 'присоединился к звонку' : 'покинул звонок',
    type: MessageTypeEnum.success
  });

  void playGroupCallPresenceSound(action);
};

const setupRoomListeners = (activeRoom: Room) => {
  activeRoom
    .on(RoomEvent.TrackPublished, () => {
      syncRemoteParticipantState();
      syncConnectionState(activeRoom);
      requestHighQualityForAllRemoteVideoTracks();
      scheduleCallAudioRecovery(activeRoom);
      void enforceSingleScreenShare();
    })
    .on(RoomEvent.TrackUnpublished, () => {
      syncRemoteParticipantState();
      syncConnectionState(activeRoom);
      scheduleCallAudioRecovery(activeRoom);
    })
    .on(RoomEvent.TrackSubscribed, () => {
      syncRemoteParticipantState();
      syncConnectionState(activeRoom);
      requestHighQualityForAllRemoteVideoTracks();
      scheduleCallAudioRecovery(activeRoom);
      resolveDirectCallRecoverySuccess(activeRoom);
      void enforceSingleScreenShare();
    })
    .on(RoomEvent.TrackUnsubscribed, () => {
      syncRemoteParticipantState();
      syncConnectionState(activeRoom);
      scheduleCallAudioRecovery(activeRoom);
    })
    .on(RoomEvent.TrackMuted, () => {
      syncLocalTrackState();
      syncLocalParticipantSpeakingState(activeRoom);
      syncRemoteParticipantState();
      scheduleCallAudioRecovery(activeRoom);
      void enforceSingleScreenShare();
    })
    .on(RoomEvent.TrackUnmuted, () => {
      syncLocalTrackState();
      syncLocalParticipantSpeakingState(activeRoom);
      syncRemoteParticipantState();
      requestHighQualityForAllRemoteVideoTracks();
      scheduleCallAudioRecovery(activeRoom);
      void enforceSingleScreenShare();
    })
    .on(RoomEvent.ActiveSpeakersChanged, () => {
      syncLocalParticipantSpeakingState(activeRoom);
      syncRemoteParticipantSpeakingState();
    })
    .on(RoomEvent.ParticipantConnected, participant => {
      clearRemoteExplicitlyLeftParticipant(participant.identity);
      clearRemoteReconnectingParticipant(participant.identity);
      syncRemoteParticipantState();
      syncConnectionState(activeRoom);
      requestHighQualityForAllRemoteVideoTracks();
      scheduleCallAudioRecovery(activeRoom);
      resolveDirectCallRecoverySuccess(activeRoom);
      showGroupCallPresenceNotification(participant, 'joined', activeRoom);
      if (state.isHandRaised) {
        void publishHandRaiseState(true);
      }
    })
    .on(RoomEvent.ParticipantDisconnected, participant => {
      const nextHandRaisedParticipants = { ...handRaisedParticipants.value };
      delete nextHandRaisedParticipants[participant.identity];
      handRaisedParticipants.value = nextHandRaisedParticipants;
      clearPendingRemoteAudioResubscribeTimeouts(participant.identity);
      clearParticipantReaction(participant.identity, false);
      markRemoteParticipantReconnecting(participant);
      syncRemoteParticipantState();
      syncConnectionState(activeRoom);

      if (
        !activeRoom.remoteParticipants.size &&
        !isGroupCallSession(topicId.value)
      ) {
        startDirectCallRecovery(roomId.value, topicId.value, {
          waitForRemote: true
        });
      }

      showGroupCallPresenceNotification(participant, 'left', activeRoom);
    })
    .on(RoomEvent.LocalTrackPublished, publication => {
      syncLocalTrackState();
      scheduleCallAudioRecovery(activeRoom);
      if (
        publication.source === Track.Source.ScreenShare ||
        publication.source === Track.Source.ScreenShareAudio
      ) {
        void ensureLocalMicrophoneState(activeRoom);
      }
    })
    .on(RoomEvent.LocalTrackUnpublished, publication => {
      syncLocalTrackState();
      scheduleCallAudioRecovery(activeRoom);
      if (
        publication.source === Track.Source.ScreenShare ||
        publication.source === Track.Source.ScreenShareAudio
      ) {
        void ensureLocalMicrophoneState(activeRoom);
      }
    })
    .on(RoomEvent.DataReceived, (payload, participant, _, topic) => {
      handleHandRaiseData(payload, participant, topic);
      handleCallReactionData(payload, participant, topic);
    })
    .on(RoomEvent.ConnectionQualityChanged, () => {
      syncLocalParticipantSpeakingState(activeRoom);
      syncRemoteParticipantState();
    })
    .on(RoomEvent.Reconnecting, () => {
      if (isExplicitHangupInProgress) {
        return;
      }

      showReconnectCallStatusNotice();
      syncLocalTrackState();
      syncLocalParticipantSpeakingState(activeRoom);
      syncRemoteParticipantState();
      syncConnectionState(activeRoom);
      scheduleCallAudioRecovery(activeRoom);
    })
    .on(RoomEvent.Reconnected, () => {
      if (callStatusNoticeKind.value === 'reconnecting') {
        clearCallStatusNotice();
      }
      syncLocalTrackState();
      syncLocalParticipantSpeakingState(activeRoom);
      syncRemoteParticipantState();
      syncConnectionState(activeRoom);
      requestHighQualityForAllRemoteVideoTracks();
      scheduleCallAudioRecovery(activeRoom);
      resolveDirectCallRecoverySuccess(activeRoom);
      void ensureLocalMicrophoneState(activeRoom);
      void enforceSingleScreenShare();
    })
    .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      if (ignoredDisconnectedRoom === activeRoom) {
        if (room === activeRoom) {
          room = null;
        }
        ignoredDisconnectedRoom = null;
        return;
      }

      if (isExplicitHangupInProgress) {
        if (room === activeRoom) {
          room = null;
        }
        cleanup(false);
        return;
      }

      if (isDuplicateIdentityDisconnect(reason)) {
        if (room === activeRoom) {
          room = null;
        }
        showEndedCallNoticeAndReleaseMedia(
          user.value,
          OTHER_DEVICE_CONNECTED_NOTICE
        );
        return;
      }

      if (matchesPendingEndCall(roomId.value, topicId.value)) {
        return;
      }

      if (room === activeRoom) {
        room = null;
      }

      if (
        startDirectCallRecovery(roomId.value, topicId.value, {
          waitForRemote: true
        })
      ) {
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
    return 'Звонок уже завершён.';
  }

  if (errorMessage.includes('429')) {
    return 'Не удалось подключиться к звонку из-за ограничения запросов. Попробуйте ещё раз через несколько секунд.';
  }

  return 'Не удалось подключиться к звонку. Попробуйте ещё раз.';
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
      if (
        !callStatus?.active ||
        (activeTopicId !== null && callStatus.topicId !== activeTopicId)
      ) {
        throw new Error('Call is no longer active');
      }

      throw new Error('Failed to get LiveKit token');
    }

    const previousRoom = room;
    if (previousRoom) {
      ignoredDisconnectedRoom = previousRoom;
      previousRoom.disconnect();
    }

    suppressParticipantPresenceNotifications = true;
    const nextRoom = new Room({
      adaptiveStream: {
        pixelDensity: 'screen'
      },
      dynacast: true,
      publishDefaults: {
        ...CAMERA_PUBLISH_DEFAULTS,
        ...SCREEN_SHARE_PUBLISH_DEFAULTS
      },
      audioCaptureDefaults: CALL_AUDIO_CAPTURE_DEFAULTS,
      videoCaptureDefaults: CAMERA_CAPTURE_DEFAULTS
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

      const isDirectCallRecovery =
        directCallRecoveryRoomId === activeRoomId &&
        directCallRecoveryTopicId === activeTopicId;

      if (
        shouldEndCallOnConnectFailure &&
        !isDirectCallRecovery &&
        sdk &&
        me &&
        activeRoomId
      ) {
        sdk.sendWebSocketEvent(WebSocketEventType.END_CALL, {
          roomId: activeRoomId,
          topicId: activeTopicId,
          userId: me.id
        });
      }

      if (isDirectCallRecovery) {
        throw error;
      }

      cleanup(false);
      showErrorNotification(getConnectErrorMessage(error));
      throw error;
    }

    if (currentAttemptId !== connectAttemptId || room !== nextRoom) {
      nextRoom.disconnect();
      return;
    }

    await applyDefaultAudioOutputRoute();

    await setLocalMicrophoneEnabled(nextRoom, state.isMicActive);
    if (state.isVideoActive) {
      if (shouldUseManagedBackgroundCamera()) {
        try {
          await publishCameraWithBackground(nextRoom);
        } catch (error) {
          state.isVideoActive = false;
          console.warn(
            '[LiveKit] Failed to publish camera with background:',
            error
          );
          showErrorNotification('Не удалось применить фон для звонка');
        }
      } else {
        await nextRoom.localParticipant.setCameraEnabled(
          true,
          CAMERA_CAPTURE_DEFAULTS,
          CAMERA_PUBLISH_DEFAULTS
        );
      }
    }
    if (state.isScreenSharingActive) {
      if (isAndroidScreenSharePlatform()) {
        await publishAndroidScreenShare(nextRoom);
      } else {
        await nextRoom.localParticipant.setScreenShareEnabled(
          true,
          SCREEN_SHARE_CAPTURE_DEFAULTS,
          SCREEN_SHARE_PUBLISH_DEFAULTS
        );
        await ensureLocalMicrophoneState(nextRoom);
      }
    }

    syncLocalTrackState();
    syncLocalParticipantSpeakingState(nextRoom);
    syncRemoteParticipantState();
    syncConnectionState(nextRoom);
    requestHighQualityForAllRemoteVideoTracks();
    scheduleCallAudioRecovery(nextRoom);
    resolveDirectCallRecoverySuccess(nextRoom);
    suppressParticipantPresenceNotifications = false;
    shouldEndCallOnConnectFailure = false;

    if (isIncoming.value) {
      stopRingtone();
    }
  })().finally(() => {
    if (currentAttemptId === connectAttemptId) {
      connectPromise = null;
    }
  });

  return connectPromise;
};

const resetMediaState = () => {
  suppressParticipantPresenceNotifications = true;
  clearTrackStreamCaches();
  currentCameraFacingMode = 'user';
  localBackgroundProcessor = null;
  localBackgroundProcessorTrack = null;
  localBackgroundProcessorSignature = null;
  hasShownBackgroundProcessorSupportError = false;
  requestedVideoActive = false;
  videoToggleOperation = null;
  localVideoStream.value = null;
  localScreenShareStream.value = null;
  clearRemoteExplicitlyLeftParticipants();
  clearRemoteReconnectingParticipants();
  remoteParticipants.value = [];
  handRaisedParticipants.value = {};
  clearAllParticipantReactions();
  isRemoteVideoActive.value = false;
  state.isMicActive = false;
  state.isVideoActive = false;
  state.isScreenSharingActive = false;
  state.isSpeakerActive = false;
  state.audioOutputRoute = 'earpiece';
  state.audioOutputDefaultRoute = 'earpiece';
  state.audioOutputAvailableRoutes = DEFAULT_AUDIO_OUTPUT_ROUTES;
  state.isFullScreen = false;
  state.isHandRaised = false;
  state.isSpeaking = false;
  state.audioLevel = 0;
  state.connectionQuality = ConnectionQuality.Unknown;
  state.activeReaction = null;
  state.activeReactionExpiresAt = null;
};

const applyCallSocketAck = (
  ack?: CallSocketAck | null,
  fallback?: {
    roomId?: string | null;
    topicId?: string | null;
    startTime?: number | null;
    elapsedDurationMs?: number;
    isNewCall?: boolean;
  }
) => {
  const resolvedRoomId = ack?.roomId ?? fallback?.roomId ?? null;
  const resolvedTopicId = ack?.topicId ?? fallback?.topicId ?? null;
  const resolvedStartTime = ack?.startTime ?? fallback?.startTime ?? null;
  const resolvedElapsedDurationMs =
    ack?.elapsedDurationMs ?? fallback?.elapsedDurationMs ?? 0;

  if (resolvedRoomId) {
    roomId.value = resolvedRoomId;
  }

  if (resolvedTopicId !== undefined) {
    topicId.value = resolvedTopicId;
  }

  if (resolvedStartTime !== undefined) {
    setCallStartedAt(resolvedStartTime ?? null, resolvedElapsedDurationMs);
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

  clearExplicitHangupState();
  clearCallStatusNotice();
  user.value = targetUser;
  topicId.value = currentTopicId;
  roomId.value = createRoomId();
  setCallStartedAt(null, 0);
  shouldEndCallOnConnectFailure = true;
  await applyDefaultAudioOutputRoute();
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
    startTime: null,
    elapsedDurationMs: 0,
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

  clearExplicitHangupState();
  clearCallStatusNotice();
  const activeRoomId = createRoomId();
  user.value = me as any;
  topicId.value = currentTopicId;
  roomId.value = activeRoomId;
  setCallStartedAt(null, 0);
  shouldEndCallOnConnectFailure = true;
  await applyDefaultAudioOutputRoute();
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
    startTime: null,
    elapsedDurationMs: 0,
    isNewCall: true
  });

  if (startAck?.accepted === false) {
    return;
  }

  const resolvedRoomId = roomId.value || activeRoomId;
  activeGroupCalls.value = {
    ...activeGroupCalls.value,
    [currentTopicId]: {
      roomId: resolvedRoomId,
      topicId: currentTopicId,
      caller: me as any,
      startTime: callStartedAt.value,
      participantCount: 1,
      groupMode: true,
      elapsedDurationMs: startAck?.elapsedDurationMs ?? 0
    }
  };

  const topicsApi = useTopics();
  topicsApi.topics.value = topicsApi.topics.value.map(topic =>
    topic.id === currentTopicId
      ? {
          ...topic,
          activeCall: {
            roomId: resolvedRoomId,
            startTime: callStartedAt.value,
            participantCount: 1,
            callType: 'livekit',
            groupMode: true,
            elapsedDurationMs: startAck?.elapsedDurationMs ?? 0
          }
        }
      : topic
  );

  await connectToRoom();
};

export const startStandaloneMeetingCall = async () => {
  if (open.value) return;

  const sdk = getChatSDK();
  const me = getAuthUser();
  if (!sdk || !me) return;

  clearExplicitHangupState();
  clearCallStatusNotice();
  const activeRoomId = createRoomId();
  user.value = me as any;
  topicId.value = null;
  roomId.value = activeRoomId;
  setCallStartedAt(null, 0);
  shouldEndCallOnConnectFailure = true;
  await applyDefaultAudioOutputRoute();
  open.value = true;
  isIncoming.value = false;
  isCalling.value = false;
  isModalVisible.value = true;

  const startAck = await sdk.sendWebSocketEventWithAck<
    WebSocketEventType.START_CALL,
    CallSocketAck
  >(WebSocketEventType.START_CALL, {
    roomId: activeRoomId,
    topicId: null,
    userId: me.id
  });

  applyCallSocketAck(startAck, {
    roomId: activeRoomId,
    topicId: null,
    startTime: null,
    elapsedDurationMs: 0,
    isNewCall: true
  });

  if (startAck?.accepted === false) {
    return;
  }

  await connectToRoom();
};

export const createStandaloneMeetingInviteLink = async (): Promise<boolean> => {
  const sdk = getChatSDK();
  const me = getAuthUser();

  if (!sdk || !me) {
    return false;
  }

  const requestedRoomId = createRoomId();
  const startAck = await sdk.sendWebSocketEventWithAck<
    WebSocketEventType.START_CALL,
    CallSocketAck
  >(WebSocketEventType.START_CALL, {
    roomId: requestedRoomId,
    topicId: null,
    userId: me.id
  });

  const activeRoomId = startAck?.roomId ?? requestedRoomId;

  if (startAck?.accepted === false || !activeRoomId) {
    return false;
  }

  try {
    const invite = await sdk.createGroupCallInvite(activeRoomId);

    if (!invite?.inviteToken) {
      return false;
    }

    await copyTextToClipboard(buildInviteUrl(invite));
    return true;
  } catch (error) {
    console.warn('Failed to create standalone meeting invite link', error);
    return false;
  }
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
  const resolvedElapsedDurationMs = callStatus.elapsedDurationMs ?? 0;
  const topicsApi = useTopics();
  topicsApi.topics.value = topicsApi.topics.value.map(topic =>
    topic.id === incomingTopicId
      ? {
          ...topic,
          activeCall: {
            roomId: incomingRoomId,
            startTime: resolvedStartTime,
            participantCount: callStatus.participantCount,
            callType: 'livekit',
            groupMode: callStatus.groupMode,
            elapsedDurationMs: resolvedElapsedDurationMs
          }
        }
      : topic
  );

  if (resolvedTopicType === TopicType.Group) {
    activeGroupCalls.value = {
      ...activeGroupCalls.value,
      [incomingTopicId]: {
        roomId: incomingRoomId,
        topicId: incomingTopicId,
        caller: targetUser,
        startTime: resolvedStartTime,
        participantCount: callStatus.participantCount,
        groupMode: callStatus.groupMode,
        elapsedDurationMs: resolvedElapsedDurationMs
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
    setCallStartedAt(resolvedStartTime, resolvedElapsedDurationMs);
    open.value = false;
    isIncoming.value = true;
    isModalVisible.value = false;
    stopRingtone();
    return true;
  }

  user.value = targetUser;
  roomId.value = incomingRoomId;
  topicId.value = incomingTopicId;
  setCallStartedAt(resolvedStartTime, resolvedElapsedDurationMs);
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
  clearExplicitHangupState();
  clearCallStatusNotice();
  shouldEndCallOnConnectFailure = false;

  if (!callStartedAt.value) {
    const callStatus = await getLiveKitCallStatus(roomId.value, topicId.value);
    setCallStartedAt(
      callStatus?.startTime ?? null,
      callStatus?.elapsedDurationMs ?? 0
    );
  }

  stopRingtone();
  if (Capacitor.isNativePlatform()) {
    endAllCallKits();
  }

  await applyDefaultAudioOutputRoute();

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
    elapsedDurationMs: callElapsedMs.value,
    isNewCall: false
  });
  if (answerAck?.accepted === false) {
    isAcceptingLocally = false;
    showTransientCallStatusNotice('Звонок уже завершён');
    return false;
  }
  localAcceptRoomId = roomId.value;
  localAcceptTopicId = topicId.value;

  try {
    await connectToRoom();
    return true;
  } finally {
    isAcceptingLocally = false;
  }
};

const resolveJoinablePendingGroupCall = (
  targetTopicId?: string
): ActiveGroupCallEntry | null => {
  if (!targetTopicId) {
    return null;
  }

  const pendingGroupCall = activeGroupCalls.value[targetTopicId];

  if (pendingGroupCall) {
    return pendingGroupCall;
  }

  const topic = useTopics().getSelectedTopic(targetTopicId) as any;
  const activeCall = topic?.activeCall;

  if (!activeCall?.roomId) {
    return null;
  }

  return {
    roomId: activeCall.roomId,
    topicId: targetTopicId,
    caller: topic?.user || null,
    startTime: activeCall.startTime ?? null,
    participantCount: activeCall.participantCount,
    groupMode: activeCall.groupMode,
    elapsedDurationMs: activeCall.elapsedDurationMs
  };
};

export const joinPendingGroupCall = async (
  targetTopicId?: string
): Promise<boolean> => {
  const pendingGroupCall = resolveJoinablePendingGroupCall(targetTopicId);
  if (!pendingGroupCall || open.value) return false;

  const sdk = getChatSDK();
  const me = getAuthUser();
  const {
    roomId: pendingRoomId,
    topicId: pendingTopicId,
    caller
  } = pendingGroupCall;

  if (!sdk || !me) return false;
  clearCallStatusNotice();
  shouldEndCallOnConnectFailure = false;

  const callStatus = await getLiveKitCallStatus(pendingRoomId, pendingTopicId);
  if (!callStatus?.active) {
    clearUnavailableCallState(pendingRoomId, pendingTopicId);
    showTransientCallStatusNotice('Звонок уже завершён');
    return false;
  }

  user.value = caller || null;
  roomId.value = pendingRoomId;
  topicId.value = pendingTopicId;
  setCallStartedAt(
    pendingGroupCall.startTime ?? callStatus.startTime ?? null,
    pendingGroupCall.elapsedDurationMs ?? callStatus.elapsedDurationMs ?? 0
  );
  await applyDefaultAudioOutputRoute();
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
    elapsedDurationMs:
      pendingGroupCall.elapsedDurationMs ?? callStatus.elapsedDurationMs ?? 0,
    isNewCall: false
  });
  if (answerAck?.accepted === false) {
    isAcceptingLocally = false;
    showTransientCallStatusNotice('Звонок уже завершён');
    return false;
  }
  localAcceptRoomId = roomId.value;
  localAcceptTopicId = topicId.value;

  try {
    await connectToRoom();
    return true;
  } finally {
    isAcceptingLocally = false;
  }
};

export const hydrateInvitedGroupCallFromUrl = async (): Promise<boolean> => {
  const sdk = getChatSDK();
  const inviteParams = getInviteParamsFromUrl();

  if (!sdk || !inviteParams) return false;

  const preview = await sdk.getGroupCallInvitePreview(
    inviteParams.roomId,
    inviteParams.inviteToken
  );

  if (!preview) {
    handleExpiredInviteLink();
    return false;
  }

  invitedGroupCall.value = {
    roomId: preview.roomId,
    topicId: preview.topicId,
    inviteToken: inviteParams.inviteToken,
    title: GROUP_CALL_INVITE_TITLE,
    avatarUrl: preview.avatarUrl || null,
    startTime: preview.startTime ?? null,
    elapsedDurationMs: preview.elapsedDurationMs ?? 0,
    participantCount: preview.participantCount,
    members: (preview.members || []) as IUser[],
    isJoinAvailable: true
  };

  if (!open.value) {
    await joinInvitedGroupCall();
  }

  return true;
};

export const openGroupCallInviteUrl = async (
  value: string
): Promise<boolean> => {
  if (typeof window === 'undefined') {
    return false;
  }

  const invite = parseGroupCallInviteUrl(value);

  if (!invite) {
    return false;
  }

  const currentUrl = new URL(window.location.href);

  currentUrl.searchParams.set('callRoom', invite.roomId);
  currentUrl.searchParams.set('callInvite', invite.inviteToken);

  if (invite.organization) {
    currentUrl.searchParams.set('organization', invite.organization);
  }

  window.history.replaceState({}, document.title, currentUrl.toString());
  return hydrateInvitedGroupCallFromUrl();
};

export const joinInvitedGroupCall = async (): Promise<boolean | void> => {
  const sdk = getChatSDK();
  const me = getAuthUser();
  const invite = invitedGroupCall.value;

  if (!sdk || !me || !invite || open.value) return false;
  clearExplicitHangupState();
  clearCallStatusNotice();
  shouldEndCallOnConnectFailure = false;

  const callStatus = await getLiveKitCallStatus(invite.roomId, invite.topicId);
  if (!callStatus?.active) {
    clearUnavailableCallState(invite.roomId, invite.topicId);
    clearInviteParamsFromUrl();
    showTransientCallStatusNotice('Звонок уже завершён');
    return false;
  }

  user.value = me as any;
  roomId.value = invite.roomId;
  topicId.value = invite.topicId;
  setCallStartedAt(
    invite.startTime ?? callStatus.startTime ?? null,
    invite.elapsedDurationMs ?? callStatus.elapsedDurationMs ?? 0
  );
  await applyDefaultAudioOutputRoute();
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
    elapsedDurationMs:
      invite.elapsedDurationMs ?? callStatus.elapsedDurationMs ?? 0,
    isNewCall: false
  });
  if (answerAck?.accepted === false) {
    isAcceptingLocally = false;
    showTransientCallStatusNotice('Звонок уже завершён');
    return;
  }
  localAcceptRoomId = roomId.value;
  localAcceptTopicId = topicId.value;

  try {
    await connectToRoom();
    clearInviteParamsFromUrl();
    return true;
  } finally {
    isAcceptingLocally = false;
  }
};

export const handleCallAnswered = async (
  answeredUserId: string,
  answeredRoomId?: string,
  answeredTopicId?: string | null,
  answeredStartTime?: number | null,
  answeredElapsedDurationMs?: number
) => {
  markIncomingCallDismissed(answeredRoomId, answeredTopicId);

  if (answeredTopicId) {
    const topicsApi = useTopics();
    const answeredTopic = topicsApi.getSelectedTopic(answeredTopicId) as any;
    const existingPendingCall = activeGroupCalls.value[answeredTopicId];
    const isGroupAnsweredCall =
      answeredTopic?.type === TopicType.Group ||
      existingPendingCall?.groupMode ||
      answeredTopic?.activeCall?.groupMode;

    if (isGroupAnsweredCall) {
      activeGroupCalls.value = {
        ...activeGroupCalls.value,
        [answeredTopicId]: {
          roomId:
            answeredRoomId ||
            existingPendingCall?.roomId ||
            answeredTopic?.activeCall?.roomId ||
            answeredTopicId,
          topicId: answeredTopicId,
          caller: existingPendingCall?.caller,
          startTime:
            answeredStartTime ??
            existingPendingCall?.startTime ??
            answeredTopic?.activeCall?.startTime ??
            null,
          participantCount:
            answeredTopic?.activeCall?.participantCount ??
            existingPendingCall?.participantCount,
          groupMode: true,
          elapsedDurationMs:
            answeredElapsedDurationMs ??
            existingPendingCall?.elapsedDurationMs ??
            answeredTopic?.activeCall?.elapsedDurationMs ??
            0
        }
      };
    }

    topicsApi.topics.value = topicsApi.topics.value.map(topic =>
      topic.id === answeredTopicId
        ? {
            ...topic,
            activeCall: {
              roomId: answeredRoomId || topic.activeCall?.roomId || topic.id,
              startTime:
                answeredStartTime ?? topic.activeCall?.startTime ?? null,
              participantCount: topic.activeCall?.participantCount,
              callType: topic.activeCall?.callType || 'livekit',
              groupMode: topic.activeCall?.groupMode ?? isGroupAnsweredCall,
              elapsedDurationMs:
                answeredElapsedDurationMs ?? topic.activeCall?.elapsedDurationMs
            }
          }
        : topic
    );
  }

  const matchesCurrentCall =
    (answeredRoomId && roomId.value === answeredRoomId) ||
    (answeredTopicId && topicId.value === answeredTopicId);
  const matchesLocalAccept =
    (answeredRoomId && localAcceptRoomId === answeredRoomId) ||
    (answeredTopicId && localAcceptTopicId === answeredTopicId);

  if (answeredRoomId && roomId.value === answeredRoomId) {
    setCallStartedAt(
      answeredStartTime ?? callStartedAt.value,
      answeredElapsedDurationMs ?? callElapsedMs.value
    );
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

const showEndedCallNoticeAndReleaseMedia = (
  activeCaller: IUser | null = user.value,
  message = DIRECT_CALL_ENDED_NOTICE
) => {
  connectAttemptId += 1;
  connectPromise = null;
  shouldEndCallOnConnectFailure = false;
  resetDirectCallRecoveryState(true);
  clearPendingAudioRecoveryTimeouts();
  clearPendingRemoteAudioResubscribeTimeouts();
  clearLocalAcceptState();
  clearCallStatusNotice();
  clearDialingTimeout();
  resetTimer();
  stopRingtone();
  stopDialingSound();

  const activeRoom = room;

  void stopLocalBackgroundProcessor();
  stopLocalMediaTracks();

  if (activeRoom) {
    ignoredDisconnectedRoom = activeRoom;
    activeRoom.disconnect();
  }

  room = null;
  isIncoming.value = false;
  isCalling.value = false;
  user.value = activeCaller;
  resetMediaState();
  open.value = true;
  isModalVisible.value = true;

  showTransientCallStatusNotice(
    message,
    ENDED_CALL_STATUS_NOTICE_CLOSE_DELAY_MS,
    'ended'
  );

  if (Capacitor.isNativePlatform()) {
    endAllCallKits();
  }
};

export const handleCallEnded = (
  endedRoomId?: string | null,
  endedTopicId?: string | null,
  reason?: CallEndReason,
  endedByUserId?: string | null
): boolean => {
  const activeCaller = user.value;
  const wasIncomingCall = isIncoming.value;

  if (matchesPendingEndCall(endedRoomId, endedTopicId)) {
    resetPendingEndCallState();
    roomId.value = null;
    topicId.value = null;

    if (wasIncomingCall || activeCaller) {
      showEndedCallNoticeAndReleaseMedia(activeCaller);
    }

    return true;
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
    return true;
  }

  if (!matchesCurrentCall) {
    return false;
  }

  const matchesActiveRecovery =
    !!directCallRecoveryRoomId &&
    ((endedRoomId && directCallRecoveryRoomId === endedRoomId) ||
      (endedTopicId && directCallRecoveryTopicId === endedTopicId));

  if (matchesActiveRecovery) {
    showEndedCallNoticeAndReleaseMedia(activeCaller);
    return true;
  }

  if (!endedByUserId) {
    if (
      startDirectCallRecovery(endedRoomId, endedTopicId, {
        waitForRemote: true
      })
    ) {
      syncRemoteParticipantState();
      return false;
    }
  }

  showEndedCallNoticeAndReleaseMedia(activeCaller);
  return true;
};

export const handleCallParticipantLeft = (
  participantId: string,
  leftRoomId?: string | null,
  leftTopicId?: string | null
): boolean => {
  const matchesCurrentCall =
    (leftRoomId && roomId.value === leftRoomId) ||
    (leftTopicId && topicId.value === leftTopicId);

  if (!matchesCurrentCall) {
    return false;
  }

  const me = getAuthUser();

  if (me?.id === participantId) {
    cleanup();
    return true;
  }

  markRemoteParticipantExplicitlyLeft(participantId);
  clearRemoteReconnectingParticipant(participantId);
  clearPendingRemoteAudioResubscribeTimeouts(participantId);
  clearParticipantReaction(participantId, false);

  const nextHandRaisedParticipants = { ...handRaisedParticipants.value };
  delete nextHandRaisedParticipants[participantId];
  handRaisedParticipants.value = nextHandRaisedParticipants;

  remoteParticipants.value = remoteParticipants.value.filter(
    participant => participant.identity !== participantId
  );
  isRemoteVideoActive.value = remoteParticipants.value.some(
    participant => participant.isVideoActive
  );

  return true;
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
    topicId?: string | null;
    callType: string;
    startTime?: number | null;
    participantCount?: number;
    groupMode?: boolean;
    elapsedDurationMs?: number;
  }>,
  replace = true
) => {
  const previousActiveGroupCalls = activeGroupCalls.value;
  const nextActiveGroupCalls = replace ? {} : { ...previousActiveGroupCalls };
  const resolvedCalls = await Promise.all(
    calls.map(async call => {
      const status = await getRawLiveKitCallStatus(call.roomId);

      if (!status) {
        return { call, status: undefined };
      }

      if (status.active !== true) {
        clearUnavailableCallState(call.roomId, call.topicId);
        return { call, status: null };
      }

      return {
        call,
        status
      };
    })
  );

  resolvedCalls.forEach(({ call, status }) => {
    if (!call || !call.topicId) {
      return;
    }

    if (status === null) {
      delete nextActiveGroupCalls[call.topicId];
      return;
    }

    const previousEntry = previousActiveGroupCalls[call.topicId];
    nextActiveGroupCalls[call.topicId] = {
      roomId: call.roomId,
      topicId: call.topicId,
      caller: previousEntry?.caller,
      startTime: status?.startTime ?? call.startTime,
      participantCount: status?.participantCount ?? call.participantCount,
      groupMode: status?.groupMode ?? call.groupMode,
      elapsedDurationMs:
        status?.elapsedDurationMs ?? call.elapsedDurationMs ?? 0
    };
  });

  activeGroupCalls.value = nextActiveGroupCalls;

  const topicsApi = useTopics();
  topicsApi.topics.value = topicsApi.topics.value.map(topic => {
    const activeCall = activeGroupCalls.value[topic.id];

    return {
      ...topic,
      activeCall: activeCall
        ? {
            roomId: activeCall.roomId,
            startTime: activeCall.startTime ?? null,
            participantCount: activeCall.participantCount,
            callType: 'livekit',
            groupMode: activeCall.groupMode,
            elapsedDurationMs: activeCall.elapsedDurationMs
          }
        : null
    };
  });
};

export const copyInvitedGroupCallLink = async () => {
  const sdk = getChatSDK();
  const activeRoomId = roomId.value;

  if (!sdk || !activeRoomId) return false;

  const invite = await sdk.createGroupCallInvite(activeRoomId);
  if (!invite) return false;

  await copyTextToClipboard(buildInviteUrl(invite));
  return true;
};

export const toggleMic = async () => {
  state.isMicActive = !state.isMicActive;
  if (room) {
    await setLocalMicrophoneEnabled(room, state.isMicActive);
    if (state.isMicActive) {
      scheduleCallAudioRecovery(room);
    }
  }
};

const applyRequestedVideoState = async (): Promise<void> => {
  while (room && state.isVideoActive !== requestedVideoActive) {
    const activeRoom = room;

    if (!activeRoom) {
      break;
    }

    if (requestedVideoActive) {
      state.isVideoActive = true;

      try {
        if (shouldUseManagedBackgroundCamera()) {
          await publishCameraWithBackground(activeRoom);
        } else {
          await activeRoom.localParticipant.setCameraEnabled(
            true,
            CAMERA_CAPTURE_DEFAULTS,
            CAMERA_PUBLISH_DEFAULTS
          );
        }
      } catch (error) {
        state.isVideoActive = false;
        requestedVideoActive = false;
        console.warn('[LiveKit] Failed to enable camera:', error);
        if (shouldUseManagedBackgroundCamera()) {
          showErrorNotification('Не удалось применить фон для звонка');
        } else {
          showErrorNotification('Не удалось включить камеру');
        }
      } finally {
        syncLocalTrackState();
      }

      continue;
    }

    state.isVideoActive = false;

    try {
      await disableLocalCamera(activeRoom);
    } finally {
      syncLocalTrackState();
    }
  }
};

export const toggleVideo = async () => {
  if (!room) return;

  requestedVideoActive = !(videoToggleOperation
    ? requestedVideoActive
    : state.isVideoActive);

  if (videoToggleOperation) {
    await videoToggleOperation;
    return;
  }

  videoToggleOperation = applyRequestedVideoState();

  try {
    await videoToggleOperation;
  } finally {
    videoToggleOperation = null;

    if (room && state.isVideoActive !== requestedVideoActive) {
      videoToggleOperation = applyRequestedVideoState();

      try {
        await videoToggleOperation;
      } finally {
        videoToggleOperation = null;
      }
    }
  }
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
      ...(shouldUseManagedBackgroundCamera()
        ? MANAGED_BACKGROUND_CAMERA_CAPTURE_DEFAULTS
        : CAMERA_CAPTURE_DEFAULTS),
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
  await selectAudioOutputRoute(
    state.audioOutputRoute === 'speaker'
      ? state.audioOutputDefaultRoute
      : 'speaker'
  );
};

const getLocalScreenSharePublication = (activeRoom = room) => {
  if (!activeRoom) {
    return null;
  }

  return Array.from(
    activeRoom.localParticipant.videoTrackPublications.values()
  ).find(publication => publication.source === Track.Source.ScreenShare);
};

const publishAndroidScreenShare = async (activeRoom = room) => {
  if (!activeRoom) {
    return;
  }

  const session = await prepareAndroidScreenShare();

  if (!session) {
    return;
  }

  androidScreenShareTrack = session.track;
  await activeRoom.localParticipant.publishTrack(session.track, {
    ...SCREEN_SHARE_PUBLISH_DEFAULTS,
    source: Track.Source.ScreenShare,
    name: Track.Source.ScreenShare,
    stream: Track.Source.ScreenShare
  });
  await ensureLocalMicrophoneState(activeRoom);
};

const unpublishAndroidScreenShare = async (activeRoom = room) => {
  if (!activeRoom) {
    await stopAndroidScreenShare();
    androidScreenShareTrack = null;
    return;
  }

  const publication = getLocalScreenSharePublication(activeRoom);
  const publishedTrack = publication?.track || androidScreenShareTrack;

  if (publishedTrack) {
    await activeRoom.localParticipant.unpublishTrack(publishedTrack);
  }

  await stopAndroidScreenShare();
  androidScreenShareTrack = null;
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

  const nextScreenShareState = !state.isScreenSharingActive;

  try {
    if (isAndroidScreenSharePlatform()) {
      if (nextScreenShareState) {
        await publishAndroidScreenShare(room);
      } else {
        isStoppingAndroidScreenShare = true;
        await unpublishAndroidScreenShare(room);
      }
    } else {
      await room.localParticipant.setScreenShareEnabled(
        nextScreenShareState,
        SCREEN_SHARE_CAPTURE_DEFAULTS,
        SCREEN_SHARE_PUBLISH_DEFAULTS
      );
      await ensureLocalMicrophoneState(room);
    }
  } catch (error) {
    const rawErrorMessage =
      error instanceof Error ? error.message : String(error);
    const errorMessage =
      error instanceof Error ? error.message.toLowerCase() : String(error);
    const isAndroidNativeScreenShare =
      Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
    const isCanceledByUser =
      errorMessage.includes('cancel') ||
      errorMessage.includes('denied') ||
      errorMessage.includes('permission');
    const isUnsupportedDevice =
      !isAndroidNativeScreenShare &&
      (errorMessage.includes('getdisplaymedia not supported') ||
        errorMessage.includes('deviceunsupportederror') ||
        errorMessage.includes('unsupported'));

    if (!isCanceledByUser) {
      showErrorNotification(
        isAndroidNativeScreenShare && rawErrorMessage
          ? `Не удалось включить демонстрацию экрана: ${rawErrorMessage}`
          : isUnsupportedDevice
            ? 'Демонстрация экрана не поддерживается на этом устройстве'
            : 'Не удалось включить демонстрацию экрана'
      );
    }

    console.warn('[LiveKit] Failed to toggle screen share:', error);
  } finally {
    isStoppingAndroidScreenShare = false;
    syncLocalTrackState();
    syncRemoteParticipantState();
    if (!state.isScreenSharingActive && isAndroidScreenSharePlatform()) {
      void stopAndroidScreenShare();
    }
  }
};

export const updateRemoteVideoSubscription = (
  participantIdentity: string,
  source: RemoteVideoSource,
  element?: HTMLVideoElement | null
) => {
  applyRemoteVideoSubscriptionPreferences(participantIdentity, source, element);
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

export const sendCallReaction = async (reaction: CallReaction) => {
  if (!room) return;

  try {
    await publishCallReaction(reaction);
  } catch (error) {
    const authUser = getAuthUser();

    if (authUser?.id) {
      clearParticipantReaction(authUser.id, false);
    }

    console.warn('[LiveKit] Failed to send call reaction:', error);
  }
};

export const leaveCall = () => {
  isExplicitHangupInProgress = true;
  const activeRoomId = roomId.value;
  const activeTopicId = topicId.value;
  const activeCaller = user.value;
  const wasIncomingCall = isIncoming.value;
  const activeTopic = activeTopicId
    ? (useTopics().getSelectedTopic(activeTopicId) as any)
    : null;
  const hasOtherParticipantsInGroupCall =
    remoteParticipants.value.length > 0 ||
    (activeTopic?.activeCall?.participantCount ?? 0) > 1;
  const isGroupCallSessionActive =
    !!activeTopicId &&
    (activeTopic?.type === TopicType.Group ||
      activeTopic?.activeCall?.groupMode ||
      invitedGroupCall.value?.roomId === activeRoomId);
  const shouldCloseImmediatelyAfterHangup =
    isGroupCallSessionActive && !hasOtherParticipantsInGroupCall;
  const shouldShowEndedNotice =
    open.value &&
    isModalVisible.value &&
    !isIncoming.value &&
    !shouldCloseImmediatelyAfterHangup;

  if (
    activeRoomId &&
    activeTopicId &&
    invitedGroupCall.value?.roomId !== activeRoomId &&
    hasOtherParticipantsInGroupCall &&
    (activeTopic?.type === TopicType.Group ||
      activeTopic?.activeCall?.groupMode ||
      remoteParticipants.value.length > 1 ||
      (activeTopic?.activeCall?.participantCount ?? 0) > 2)
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

  if (shouldShowEndedNotice || wasIncomingCall) {
    showEndedCallNoticeAndReleaseMedia(activeCaller);
    return;
  }

  connectAttemptId += 1;
  connectPromise = null;
  shouldEndCallOnConnectFailure = false;
  resetDirectCallRecoveryState(true);
  clearPendingAudioRecoveryTimeouts();
  clearPendingRemoteAudioResubscribeTimeouts();
  clearLocalAcceptState();
  clearCallStatusNotice();
  clearDialingTimeout();
  resetTimer();
  stopRingtone();
  stopDialingSound();

  const activeRoom = room;

  void stopLocalBackgroundProcessor();
  stopLocalMediaTracks();

  if (activeRoom) {
    activeRoom.disconnect();
  }

  room = null;
  open.value = false;
  isIncoming.value = false;
  isCalling.value = false;
  resetMediaState();
  isModalVisible.value = false;
  user.value = null;

  if (Capacitor.isNativePlatform()) {
    endAllCallKits();
  }
};

export const cleanup = (disconnectRoom = true) => {
  connectAttemptId += 1;
  connectPromise = null;
  shouldEndCallOnConnectFailure = false;
  clearExplicitHangupState();
  void stopAndroidScreenShare();
  resetDirectCallRecoveryState(true);
  clearPendingAudioRecoveryTimeouts();
  clearPendingRemoteAudioResubscribeTimeouts();
  clearLocalAcceptState();
  clearCallStatusNotice();
  resetPendingEndCallState();
  clearDialingTimeout();
  resetTimer();
  stopRingtone();
  stopDialingSound();

  const activeRoom = room;

  void stopLocalBackgroundProcessor();
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
    if (targetRoomId) {
      roomId.value = targetRoomId;
    }

    if (targetTopicId) {
      topicId.value = targetTopicId;
    }

    isIncoming.value = true;
    open.value = true;
    isModalVisible.value = true;
    leaveCall();
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
  if (targetTopicId) {
    const topicsApi = useTopics();
    topicsApi.topics.value = topicsApi.topics.value.map(topic =>
      topic.id === targetTopicId
        ? {
            ...topic,
            activeCall: null
          }
        : topic
    );
  }
};

export const clearInvitedGroupCall = (activeRoomId?: string) => {
  removeInvitedGroupCallEntry(activeRoomId);
};

watch(
  [selectedCallBackgroundMode, selectedCallBackgroundImageUrl],
  () => {
    if (selectedCallBackgroundMode.value !== 'none') {
      void prewarmCallBackgroundAssets(getManagedBackgroundImageUrl());
    }

    if (!state.isVideoActive) {
      return;
    }

    void syncLocalCallBackgroundProcessor();
  },
  {
    immediate: true
  }
);

export { open, isIncoming, isCalling, user, roomId, topicId, isModalVisible };
export {
  state,
  formattedTime,
  callStatusNotice,
  callStatusNoticeKind,
  localVideoStream,
  localScreenShareStream,
  remoteParticipants,
  isRemoteVideoActive,
  activeGroupCalls,
  activeScreenShare,
  invitedGroupCall
};

if (typeof window !== 'undefined') {
  if (Capacitor.isNativePlatform()) {
    setupAudioOutputRouteListener();

    void App.addListener('appStateChange', ({ isActive }) => {
      isNativeAppInBackground = !isActive;

      if (!isActive) {
        if (callStatusNoticeKind.value === 'reconnecting') {
          clearCallStatusNotice();
        }
        return;
      }

      if (directCallRecoveryRoomId && directCallRecoveryTopicId) {
        showReconnectCallStatusNotice();
      }
    });
  }

  window.addEventListener('beforeunload', () => {
    if (open.value && !Capacitor.isNativePlatform()) {
      leaveCall();
    }
  });
}
