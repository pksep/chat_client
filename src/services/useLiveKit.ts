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
  ConnectionState,
  DisconnectReason,
  LocalTrackPublication,
  LocalVideoTrack,
  Participant,
  RemoteParticipant,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  type TrackPublication,
  VideoPresets,
  VideoQuality
} from 'livekit-client';
import type { ReconnectContext, ReconnectPolicy } from 'livekit-client';
import { MessageTypeEnum } from '@pksep/yui';
import { watch } from 'vue';
import type { IUser } from '../components/interfaces/interfaces';
import { getAuthUser } from '../composables/useAuth';
import { getAuthToken } from '../composables/useLogin';
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
import {
  createTelemetryTraceId,
  getTelemetryErrorPayload,
  recordTelemetryEvent
} from './useTelemetry';
import {
  addNativeNetworkStatusListener,
  getNativeNetworkStatus,
  type NativeNetworkStatus
} from './useTelemetryDevice';
import {
  activeGroupCalls,
  ACTIVE_CALL_SESSION_STORAGE_KEY,
  activeScreenShare,
  callElapsedMs,
  callStartedAt,
  callStatusNotice,
  callStatusNoticeKind,
  formattedTime,
  handRaisedParticipants,
  invitedGroupCall,
  isCalling,
  isIncoming,
  isModalVisible,
  isRemoteVideoActive,
  localScreenShareStream,
  localVideoStream,
  open,
  participantReactions,
  pendingEndCallRoomId,
  pendingEndCallTopicId,
  remoteParticipants,
  roomId,
  state,
  timerSeconds,
  topicId,
  user,
  type ActiveGroupCallEntry,
  type CallReaction,
  type CallStatusNoticeKind,
  type ParticipantMediaState
} from './useCallState';
import {
  isLiveKitPageReloadIntentActive,
  markLiveKitPageReloadIntent
} from './live-kit-page-reload-intent';

export type { CallReaction } from './useCallState';

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

type StreamCacheEntry = {
  trackId: string;
  track: MediaStreamTrack;
  stream: MediaStream;
};

type RemoteReconnectingParticipantEntry = {
  participant: ParticipantMediaState;
};

type CallEndReason = 'busy';
type RemoteVideoSource = 'camera' | 'screen';
type DirectCallRecoveryOptions = {
  waitForRemote?: boolean;
  remoteUserId?: string | null;
  reason?: string;
};
type CallIssueSignalSeverity = 'soft' | 'hard';
type CallIssueSignal = {
  name: string;
  severity: CallIssueSignalSeverity;
  at: number;
  reason?: string | null;
};

type CallSocketAck = {
  accepted?: boolean;
  roomId?: string | null;
  topicId?: string | null;
  startTime?: number | null;
  elapsedDurationMs?: number;
  isNewCall?: boolean;
};
type InvitedGroupCallEntry = NonNullable<typeof invitedGroupCall.value>;
type GroupCallInvitePreview = Omit<
  InvitedGroupCallEntry,
  'inviteToken' | 'isJoinAvailable'
>;
type CallTimerSnapshot = {
  startTime?: number | null;
  elapsedDurationMs?: number | null;
};
type NormalizedCallTimerSnapshot = {
  startTime: number | null;
  elapsedDurationMs: number;
};
type PersistedActiveCallSession = {
  authUserId: string;
  roomId: string;
  topicId: string | null;
  inviteToken?: string;
  isIncoming: boolean;
  isCalling: boolean;
  startTime?: number | null;
  elapsedDurationMs?: number;
  savedAt: number;
};

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
let invitedGroupCallJoinPromise: Promise<boolean | void> | null = null;
let invitedGroupCallJoinRoomId: string | null = null;
let activeCallTraceId: string | null = null;
let lastTelemetryConnectionQuality: string | null = null;
let currentCameraFacingMode: 'user' | 'environment' = 'user';
let lastAudioOutputTelemetrySignature = '';
let lastAudioOutputDiagnostics: Record<string, unknown> = {};
let lastCallIssueSignal: CallIssueSignal | null = null;
let lastKnownActiveRoomRemoteParticipantCount = 0;
let lastRemoteParticipantEmptyTelemetrySignature = '';
let isExplicitHangupInProgress = false;
let pageUnloadHangupRoomId: string | null = null;
let isLocalNetworkOffline = false;
let nativeNetworkStatusListener: PluginListenerHandle | null = null;
let androidScreenShareTrack: MediaStreamTrack | null = null;
let isStoppingAndroidScreenShare = false;
let isStoppingScreenShare = false;
let shouldRecoverLocalScreenShare = false;
let localScreenShareTrackForRecovery: LocalVideoTrack | null = null;
let screenShareRecoveryTimeout: ReturnType<typeof setTimeout> | null = null;
let screenShareRecoveryPromise: Promise<boolean> | null = null;
let screenShareRecoveryAttemptId = 0;
let screenShareRecoveryAttemptCount = 0;
const localTrackStreamCache = new Map<string, StreamCacheEntry>();
const remoteTrackStreamCache = new Map<string, StreamCacheEntry>();
let pendingEndCallRetryTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingEndCallFinalizeTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingEndCallAcknowledged = false;
let pendingNativeCallActionTimeout: ReturnType<typeof setTimeout> | null = null;
let callStatusNoticeTimeout: ReturnType<typeof setTimeout> | null = null;
let directCallRecoveryTimeout: ReturnType<typeof setTimeout> | null = null;
let directCallRecoveryAttemptId = 0;
let directCallRecoveryAttemptCount = 0;
let directCallRecoveryStartedAt = 0;
let lastDirectCallRecoveryAttemptTelemetryAt = 0;
let directCallRecoveryInFlight = false;
let directCallRecoveryRoomId: string | null = null;
let directCallRecoveryTopicId: string | null = null;
let activeCallNetworkRecoveryPromise: Promise<boolean> | null = null;
let localVideoQualityRecoveryTimeout: ReturnType<typeof setTimeout> | null =
  null;
let localVideoPublishingQuality = VideoQuality.HIGH;
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
const DIRECT_CALL_EXPLICIT_LEAVE_SUPPRESSION_MS = 30000;
const DIRECT_CALL_RECONNECT_POLL_MS = 2000;
const DIRECT_CALL_RECOVERY_TELEMETRY_INTERVAL_MS = 30_000;
const SCREEN_SHARE_RECOVERY_RETRY_DELAY_MS = 2000;
const LOCAL_VIDEO_QUALITY_RECOVERY_DELAY_MS = 10_000;
const CALL_ISSUE_SIGNAL_CONTEXT_MS = 5 * 60 * 1000;
const END_CALL_ACK_TIMEOUT_MS = 1200;
const ACTIVE_CALL_CLOSE_WARNING =
  'У вас есть активный звонок. Если закрыть вкладку, звонок будет завершен.';
const INVITED_GROUP_CALL_CONNECT_ATTEMPTS = 2;
const INVITED_GROUP_CALL_CONNECT_RETRY_DELAY_MS = 1200;
const DIRECT_CALL_RECONNECT_FAILED_NOTICE = 'Не удалось восстановить звонок';
const DIRECT_CALL_ENDED_NOTICE = 'Звонок завершён';
const CALL_RECONNECT_NOTICE = 'Переподключение';
const OTHER_DEVICE_CONNECTED_NOTICE = 'Звонок открыт на другом устройстве';
const GROUP_CALL_INVITE_TITLE = 'Групповой звонок';
const DEFAULT_AUDIO_OUTPUT_ROUTES: Array<Exclude<AudioOutputRoute, 'auto'>> = [
  'earpiece',
  'speaker'
];
const dismissedIncomingCallRooms = new Map<string, number>();
const dismissedIncomingCallTopics = new Map<string, number>();

const normalizeCallTimerSnapshot = (
  snapshot?: CallTimerSnapshot | null
): NormalizedCallTimerSnapshot => ({
  startTime:
    typeof snapshot?.startTime === 'number' &&
    Number.isFinite(snapshot.startTime)
      ? snapshot.startTime
      : null,
  elapsedDurationMs:
    typeof snapshot?.elapsedDurationMs === 'number' &&
    Number.isFinite(snapshot.elapsedDurationMs)
      ? Math.max(0, snapshot.elapsedDurationMs)
      : 0
});

const getCallTimerSnapshotDurationMs = (
  snapshot: NormalizedCallTimerSnapshot,
  now = Date.now()
): number =>
  snapshot.elapsedDurationMs +
  (snapshot.startTime ? Math.max(0, now - snapshot.startTime) : 0);

const getCurrentCallTimerSnapshot = (): NormalizedCallTimerSnapshot =>
  normalizeCallTimerSnapshot({
    startTime: callStartedAt.value,
    elapsedDurationMs: callElapsedMs.value
  });

const hasCallTimerSnapshotProgress = (
  snapshot: NormalizedCallTimerSnapshot
): boolean => snapshot.startTime !== null || snapshot.elapsedDurationMs > 0;

const selectLongestCallTimerSnapshot = (
  ...snapshots: Array<CallTimerSnapshot | null | undefined>
): NormalizedCallTimerSnapshot =>
  snapshots
    .map(snapshot => normalizeCallTimerSnapshot(snapshot))
    .reduce(
      (best, snapshot) =>
        getCallTimerSnapshotDurationMs(snapshot) >
        getCallTimerSnapshotDurationMs(best) + 1000
          ? snapshot
          : best,
      normalizeCallTimerSnapshot(null)
    );

const resolveRestoredCallTimerSnapshot = (
  primarySnapshot: CallTimerSnapshot,
  persistedSession?: PersistedActiveCallSession | null
): NormalizedCallTimerSnapshot =>
  selectLongestCallTimerSnapshot(primarySnapshot, persistedSession);

const readPersistedActiveCallSession =
  (): PersistedActiveCallSession | null => {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const rawSession = window.localStorage.getItem(
        ACTIVE_CALL_SESSION_STORAGE_KEY
      );
      if (!rawSession) {
        return null;
      }

      const session = JSON.parse(rawSession) as PersistedActiveCallSession;
      const me = getAuthUser();
      if (!me || session.authUserId !== me.id || !session.roomId) {
        return null;
      }

      return session;
    } catch {
      return null;
    }
  };

const getCallInviteToken = (
  activeRoomId?: string | null
): string | undefined => {
  if (!activeRoomId) {
    return undefined;
  }

  if (invitedGroupCall.value?.roomId === activeRoomId) {
    return invitedGroupCall.value.inviteToken;
  }

  const persistedSession = readPersistedActiveCallSession();
  return persistedSession?.roomId === activeRoomId
    ? persistedSession.inviteToken
    : undefined;
};

const getMatchingPersistedCallTimerSnapshot = (
  activeRoomId = roomId.value,
  activeTopicId = topicId.value
): PersistedActiveCallSession | null => {
  const session = readPersistedActiveCallSession();

  if (!session) {
    return null;
  }

  if (activeRoomId && session.roomId !== activeRoomId) {
    return null;
  }

  if (activeTopicId && session.topicId !== activeTopicId) {
    return null;
  }

  return session;
};

const getTopicCallTimerSnapshot = (
  activeRoomId = roomId.value,
  activeTopicId = topicId.value
): CallTimerSnapshot | null => {
  if (!activeTopicId) {
    return null;
  }

  const topic = useTopics().getSelectedTopic(activeTopicId) as any;
  const activeCall = topic?.activeCall || activeGroupCalls.value[activeTopicId];

  if (!activeCall || (activeRoomId && activeCall.roomId !== activeRoomId)) {
    return null;
  }

  return {
    startTime: activeCall.startTime ?? null,
    elapsedDurationMs: activeCall.elapsedDurationMs ?? 0
  };
};

const getActiveCallTimerSnapshotFallback =
  (): NormalizedCallTimerSnapshot | null => {
    const snapshot = selectLongestCallTimerSnapshot(
      getCurrentCallTimerSnapshot(),
      getMatchingPersistedCallTimerSnapshot(),
      getTopicCallTimerSnapshot()
    );

    return hasCallTimerSnapshotProgress(snapshot) ? snapshot : null;
  };

const persistActiveCallSession = (
  activeRoomId = roomId.value,
  activeTopicId = topicId.value,
  inviteToken?: string
): void => {
  if (typeof window === 'undefined' || !activeRoomId) {
    return;
  }

  const me = getAuthUser();
  if (!me) {
    return;
  }
  const timerSnapshot = getCurrentCallTimerSnapshot();
  const existingSession = readPersistedActiveCallSession();

  const session: PersistedActiveCallSession = {
    authUserId: me.id,
    roomId: activeRoomId,
    topicId: activeTopicId ?? null,
    inviteToken:
      inviteToken ||
      getCallInviteToken(activeRoomId) ||
      (existingSession?.roomId === activeRoomId
        ? existingSession.inviteToken
        : undefined),
    isIncoming: isIncoming.value,
    isCalling: isCalling.value,
    startTime: timerSnapshot.startTime,
    elapsedDurationMs: timerSnapshot.elapsedDurationMs,
    savedAt: Date.now()
  };

  try {
    window.localStorage.setItem(
      ACTIVE_CALL_SESSION_STORAGE_KEY,
      JSON.stringify(session)
    );
  } catch {
    // Восстановление через сервер остаётся доступным без localStorage.
  }
};

const clearPersistedActiveCallSession = (
  expectedRoomId?: string | null
): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (expectedRoomId) {
      const session = readPersistedActiveCallSession();
      if (session && session.roomId !== expectedRoomId) {
        return;
      }
    }

    window.localStorage.removeItem(ACTIVE_CALL_SESSION_STORAGE_KEY);
  } catch {
    // Нечего очищать, если storage недоступен.
  }
};

const CAMERA_CAPTURE_DEFAULTS = {
  facingMode: 'user' as const,
  frameRate: 24,
  resolution: VideoPresets.h720.resolution
};
const MANAGED_BACKGROUND_CAMERA_CAPTURE_DEFAULTS = {
  facingMode: 'user' as const,
  frameRate: 24,
  resolution: VideoPresets.h720.resolution
};
const CAMERA_PUBLISH_DEFAULTS = {
  degradationPreference: 'balanced' as RTCDegradationPreference,
  simulcast: true,
  videoEncoding: VideoPresets.h720.encoding,
  videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360]
};
const MANAGED_BACKGROUND_CAMERA_PUBLISH_DEFAULTS = {
  degradationPreference: 'balanced' as RTCDegradationPreference,
  simulcast: true,
  videoEncoding: VideoPresets.h720.encoding,
  videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360]
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
const LIVEKIT_RECONNECT_POLICY: ReconnectPolicy = {
  nextRetryDelayInMs(context: ReconnectContext): number {
    const retryDelays = [0, 300, 1200, 2700, 4800, 7000];
    const delay =
      retryDelays[Math.min(context.retryCount, retryDelays.length - 1)];

    return context.retryCount <= 1 ? delay : delay + Math.random() * 1000;
  }
};
const CALL_AUDIO_CAPTURE_DEFAULTS: AudioCaptureOptions = {
  echoCancellation: true,
  noiseSuppression: true,
  voiceIsolation: true,
  autoGainControl: true,
  channelCount: 1
};

// Chrome rejects the whole constraint object when one optional key is not
// supported. Keep the reliable echo/noise controls and pass only keys that
// this browser actually exposes.
const getSupportedCallAudioCaptureOptions = (): AudioCaptureOptions => {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    return CALL_AUDIO_CAPTURE_DEFAULTS;
  }

  const supported = navigator.mediaDevices.getSupportedConstraints();
  return Object.fromEntries(
    Object.entries(CALL_AUDIO_CAPTURE_DEFAULTS).filter(
      ([key]) =>
        key === 'channelCount' ||
        supported[key as keyof MediaTrackSupportedConstraints]
    )
  ) as AudioCaptureOptions;
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

const ensureCallTelemetryTraceId = (): string => {
  if (!activeCallTraceId) {
    activeCallTraceId = createTelemetryTraceId('call');
    lastTelemetryConnectionQuality = null;
  }

  return activeCallTraceId;
};

const resetCallTelemetryState = (): void => {
  activeCallTraceId = null;
  lastTelemetryConnectionQuality = null;
  lastAudioOutputTelemetrySignature = '';
  lastAudioOutputDiagnostics = {};
  lastCallIssueSignal = null;
  lastKnownActiveRoomRemoteParticipantCount = 0;
  lastRemoteParticipantEmptyTelemetrySignature = '';
};

const buildCallTelemetryPayload = (
  payload: Record<string, unknown> = {}
): Record<string, unknown> => ({
  roomId: roomId.value,
  topicId: topicId.value,
  isIncoming: isIncoming.value,
  isCalling: isCalling.value,
  isOpen: open.value,
  remoteParticipantCount: remoteParticipants.value.length,
  localParticipantCount: room ? 1 : 0,
  connectionQuality: state.connectionQuality,
  micActive: state.isMicActive,
  videoActive: state.isVideoActive,
  screenShareActive: state.isScreenSharingActive,
  audioOutputRoute: state.audioOutputRoute,
  audioOutputDiagnostics: lastAudioOutputDiagnostics,
  elapsedCallMs: getElapsedCallDurationMs(),
  ...payload
});

const markCallIssueSignal = (
  name: string,
  severity: CallIssueSignalSeverity = 'hard',
  payload: Record<string, unknown> = {}
): void => {
  lastCallIssueSignal = {
    name,
    severity,
    at: Date.now(),
    reason: typeof payload.reason === 'string' ? payload.reason : null
  };
};

const clearCallIssueSignal = (severity?: CallIssueSignalSeverity): void => {
  if (!lastCallIssueSignal) {
    return;
  }

  if (!severity || lastCallIssueSignal.severity === severity) {
    lastCallIssueSignal = null;
  }
};

const hasLiveTrack = (
  stream: MediaStream | null | undefined,
  kind: 'audio' | 'video'
): boolean =>
  !!stream
    ?.getTracks()
    .some(track => track.kind === kind && track.readyState === 'live');

const buildCallHealthTelemetryPayload = (
  activeRoom: Room | null = room
): Record<string, unknown> => {
  const now = Date.now();
  const lastIssueSignalAgeMs = lastCallIssueSignal
    ? now - lastCallIssueSignal.at
    : null;
  const issueSignalIsRecent =
    lastIssueSignalAgeMs !== null &&
    lastIssueSignalAgeMs >= 0 &&
    lastIssueSignalAgeMs <= CALL_ISSUE_SIGNAL_CONTEXT_MS;
  const hardSignalBeforeLeave =
    !!lastCallIssueSignal &&
    lastCallIssueSignal.severity === 'hard' &&
    issueSignalIsRecent;
  const remoteAudioParticipantCount = remoteParticipants.value.filter(
    participant =>
      participant.isMicActive || hasLiveTrack(participant.audioStream, 'audio')
  ).length;
  const remoteVideoParticipantCount = remoteParticipants.value.filter(
    participant =>
      participant.isVideoActive ||
      hasLiveTrack(participant.cameraStream, 'video') ||
      hasLiveTrack(participant.screenShareStream, 'video') ||
      hasLiveTrack(participant.videoStream, 'video')
  ).length;

  return {
    liveKitState: activeRoom?.state ?? null,
    hasRoom: Boolean(activeRoom),
    roomRemoteParticipantCount: activeRoom?.remoteParticipants.size ?? 0,
    visibleRemoteParticipantCount: remoteParticipants.value.length,
    remoteAudioParticipantCount,
    remoteVideoParticipantCount,
    hasRemoteParticipants:
      (activeRoom?.remoteParticipants.size ?? 0) > 0 ||
      remoteParticipants.value.length > 0,
    hasRemoteAudio: remoteAudioParticipantCount > 0,
    hasRemoteVideo: remoteVideoParticipantCount > 0,
    pendingRemoteReconnectParticipantCount: remoteReconnectingParticipants.size,
    directCallRecoveryActive: Boolean(directCallRecoveryRoomId),
    directCallRecoveryWaitForRemote,
    pendingEndCallActive: Boolean(pendingEndCallRoomId.value),
    explicitHangupInProgress: isExplicitHangupInProgress,
    lastCallIssueSignalName: lastCallIssueSignal?.name ?? null,
    lastCallIssueSignalSeverity: lastCallIssueSignal?.severity ?? null,
    lastCallIssueSignalReason: lastCallIssueSignal?.reason ?? null,
    lastCallIssueSignalAt: lastCallIssueSignal
      ? new Date(lastCallIssueSignal.at).toISOString()
      : null,
    msSinceLastCallIssueSignal: lastIssueSignalAgeMs,
    callIssueSignalBeforeLeave: issueSignalIsRecent,
    hardSignalBeforeLeave,
    ...getBrowserNetworkTelemetryPayload()
  };
};

const buildCallLeaveTelemetryPayload = (
  payload: Record<string, unknown> = {},
  activeRoom: Room | null = room
): Record<string, unknown> => {
  const health = buildCallHealthTelemetryPayload(activeRoom);
  let leaveIntent = 'manual';

  if (health.hardSignalBeforeLeave) {
    leaveIntent = 'manual_after_hard_signal';
  } else if (health.callIssueSignalBeforeLeave) {
    leaveIntent = 'manual_after_issue_signal';
  }

  return {
    leaveIntent,
    ...health,
    ...payload
  };
};

const recordRemoteParticipantLossIfNeeded = (
  trigger: string,
  activeRoom: Room | null = room
): void => {
  const currentRoomRemoteCount = activeRoom?.remoteParticipants.size ?? 0;
  const hadRemoteParticipant = lastKnownActiveRoomRemoteParticipantCount > 0;

  lastKnownActiveRoomRemoteParticipantCount = Math.max(
    currentRoomRemoteCount,
    remoteParticipants.value.length
  );

  if (
    !hadRemoteParticipant ||
    currentRoomRemoteCount > 0 ||
    !open.value ||
    isIncoming.value ||
    isCalling.value ||
    !roomId.value ||
    !topicId.value ||
    isGroupCallSession(topicId.value)
  ) {
    return;
  }

  const signature = [
    roomId.value,
    topicId.value,
    trigger,
    directCallRecoveryRoomId || 'no-recovery'
  ].join(':');

  if (signature === lastRemoteParticipantEmptyTelemetrySignature) {
    return;
  }

  lastRemoteParticipantEmptyTelemetrySignature = signature;
  markCallIssueSignal('call.media.remote_participants_empty', 'hard', {
    reason: trigger
  });
  recordCallTelemetryEvent(
    'call.media.remote_participants_empty',
    {
      trigger,
      ...buildCallHealthTelemetryPayload(activeRoom)
    },
    'warn'
  );
};

const getBrowserNetworkTelemetryPayload = (): Record<string, unknown> => {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const connection = (
    nav as
      | (Navigator & {
          connection?: {
            effectiveType?: string;
            downlink?: number;
            rtt?: number;
            saveData?: boolean;
            type?: string;
          };
        })
      | undefined
  )?.connection;

  return {
    documentVisibility:
      typeof document !== 'undefined' ? document.visibilityState : undefined,
    documentHasFocus:
      typeof document !== 'undefined' ? document.hasFocus() : undefined,
    browserOnline: nav?.onLine,
    networkEffectiveType: connection?.effectiveType,
    networkType: connection?.type,
    networkDownlink: connection?.downlink,
    networkRtt: connection?.rtt,
    networkSaveData: connection?.saveData
  };
};

const buildCallRecoveryTelemetryPayload = (
  reason: string | undefined,
  activeRoom: Room | null = room,
  payload: Record<string, unknown> = {}
): Record<string, unknown> => ({
  reason,
  liveKitState: activeRoom?.state ?? null,
  hasRoom: Boolean(activeRoom),
  roomRemoteParticipantCount: activeRoom?.remoteParticipants.size ?? 0,
  directCallRecoveryActive: Boolean(directCallRecoveryRoomId),
  directCallRecoveryWaitForRemote,
  isNativeAppInBackground,
  ...getBrowserNetworkTelemetryPayload(),
  ...payload
});

const recordCallTelemetryEvent = (
  name: string,
  payload?: Record<string, unknown>,
  level: 'debug' | 'info' | 'warn' | 'error' = 'info'
): void => {
  const traceId =
    activeCallTraceId ||
    (roomId.value || topicId.value || open.value
      ? ensureCallTelemetryTraceId()
      : null);

  if (!traceId) {
    return;
  }

  recordTelemetryEvent({
    category: 'call',
    name,
    level,
    traceId,
    entityType: 'call',
    entityId: roomId.value || topicId.value,
    payload: buildCallTelemetryPayload(payload)
  });
};

const buildAudioOutputDiagnosticsPayload = (
  audioState: AudioOutputState | null | undefined,
  currentRoute: Exclude<AudioOutputRoute, 'auto'>
): Record<string, unknown> => ({
  audioOutputRoute: currentRoute,
  audioOutputDefaultRoute:
    audioState?.defaultRoute ?? state.audioOutputDefaultRoute,
  audioOutputAvailableRoutes:
    audioState?.availableRoutes ?? state.audioOutputAvailableRoutes,
  audioMode: audioState?.audioMode ?? null,
  audioModeValue: audioState?.audioModeValue ?? null,
  volumeControlStream: audioState?.volumeControlStream ?? null,
  volumeControlStreamValue: audioState?.volumeControlStreamValue ?? null,
  voiceCallVolume: audioState?.voiceCallVolume ?? null,
  voiceCallMaxVolume: audioState?.voiceCallMaxVolume ?? null,
  musicVolume: audioState?.musicVolume ?? null,
  musicMaxVolume: audioState?.musicMaxVolume ?? null,
  speakerphoneOn: audioState?.speakerphoneOn ?? null,
  bluetoothScoOn: audioState?.bluetoothScoOn ?? null,
  wiredHeadsetConnected: audioState?.wiredHeadsetConnected ?? null,
  activeOutputType: audioState?.activeOutputType ?? null,
  activeOutputName: audioState?.activeOutputName ?? null
});

const recordAudioOutputDiagnostics = (
  source: string,
  audioState: AudioOutputState | null | undefined,
  currentRoute: Exclude<AudioOutputRoute, 'auto'>
): void => {
  const payload = buildAudioOutputDiagnosticsPayload(audioState, currentRoute);
  lastAudioOutputDiagnostics = payload;

  if (
    !open.value &&
    !isCalling.value &&
    !isIncoming.value &&
    !isModalVisible.value
  ) {
    return;
  }

  const signature = JSON.stringify(payload);
  if (signature === lastAudioOutputTelemetrySignature) {
    return;
  }

  lastAudioOutputTelemetrySignature = signature;
  recordCallTelemetryEvent('call.audio_output.state', {
    source,
    ...payload
  });
};

const recordCallConnectionQualityIfChanged = (): void => {
  if (lastTelemetryConnectionQuality === state.connectionQuality) {
    return;
  }

  lastTelemetryConnectionQuality = state.connectionQuality;
  recordCallTelemetryEvent('call.connection_quality.changed', {
    connectionQuality: state.connectionQuality
  });
};

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
  clearPersistedActiveCallSession(targetRoomId);
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
  directCallRecoveryAttemptCount = 0;
  directCallRecoveryStartedAt = 0;
  lastDirectCallRecoveryAttemptTelemetryAt = 0;
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

const shouldSuppressReconnectNotice = () => {
  if (Capacitor.isNativePlatform()) {
    return isNativeAppInBackground;
  }

  return (
    !isLocalNetworkOffline &&
    typeof document !== 'undefined' &&
    document.visibilityState === 'hidden'
  );
};

const isOutgoingDialingCall = (
  status?: Pick<LiveKitCallStatus, 'startTime' | 'wasAnswered'> | null
): boolean => {
  const statusStartTime =
    typeof status?.startTime === 'number' && Number.isFinite(status.startTime)
      ? status.startTime
      : null;

  return (
    isCalling.value &&
    !isIncoming.value &&
    status?.wasAnswered !== true &&
    callElapsedMs.value === 0 &&
    statusStartTime === null &&
    callStartedAt.value === null
  );
};

const showReconnectCallStatusNotice = () => {
  if (isExplicitHangupInProgress) {
    return;
  }

  if (isOutgoingDialingCall()) {
    if (callStatusNoticeKind.value === 'reconnecting') {
      clearCallStatusNotice();
    }
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
  recordAudioOutputDiagnostics('apply', audioState, currentRoute);
};

const isCallReconnecting = () =>
  callStatusNoticeKind.value === 'reconnecting' ||
  !!directCallRecoveryRoomId ||
  !!activeCallNetworkRecoveryPromise ||
  room?.state === ConnectionState.Reconnecting ||
  room?.state === ConnectionState.SignalReconnecting;

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

const releaseNativeCallAudio = (): void => {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  AudioOutput.releaseCallAudio().catch(error => {
    console.warn('[LiveKit] Failed to release native call audio:', error);
  });
};

const applyCurrentAudioOutputRoute = async () => {
  await selectAudioOutputRoute(state.audioOutputRoute);
};

const handleNativeAudioRouteChanged = async (audioState: AudioOutputState) => {
  if (!audioState.callAudioActive) {
    applyAudioOutputState(audioState);
    return;
  }

  const wasBluetoothActive = state.audioOutputRoute === 'bluetooth';
  const wasBluetoothAvailable =
    state.audioOutputAvailableRoutes.includes('bluetooth');
  const isBluetoothAvailable = audioState.availableRoutes.includes('bluetooth');

  if (wasBluetoothActive && !isBluetoothAvailable) {
    await selectAudioOutputRoute('earpiece');
    return;
  }

  if (
    open.value &&
    !isCallReconnecting() &&
    !wasBluetoothAvailable &&
    isBluetoothAvailable
  ) {
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
  await selectAudioOutputRoute('earpiece');
};

const isGroupCallSession = (targetTopicId?: string | null): boolean => {
  const activeTopicId = targetTopicId ?? topicId.value;
  const activeTopic = activeTopicId
    ? (useTopics().getSelectedTopic(activeTopicId) as any)
    : null;

  return !!(
    activeTopic?.type === TopicType.Group ||
    activeTopic?.activeCall?.groupMode ||
    invitedGroupCall.value ||
    getCallInviteToken(roomId.value)
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
    invitedGroupCall.value?.topicId === activeTopicId ||
    Boolean(getCallInviteToken(activeRoomId));
  const knownParticipantCount =
    activeTopic?.activeCall?.participantCount ??
    (roomId.value === activeRoomId && topicId.value === activeTopicId && room
      ? room.remoteParticipants.size + 1
      : 0);

  return !!(
    matchesCurrentCall &&
    activeTopicId &&
    activeTopic?.type === TopicType.DM &&
    !isInvitedGroupSession &&
    !activeTopic?.activeCall?.groupMode &&
    knownParticipantCount <= 2
  );
};

const isRecoverableActiveCallSession = (
  targetRoomId?: string | null,
  targetTopicId?: string | null
): boolean => {
  const activeRoomId = targetRoomId ?? roomId.value;
  const activeTopicId = targetTopicId ?? topicId.value;
  const matchesCurrentCall =
    (!!activeRoomId && roomId.value === activeRoomId) ||
    (!!activeTopicId && topicId.value === activeTopicId);
  const hasCallRuntime =
    open.value ||
    isModalVisible.value ||
    isIncoming.value ||
    isCalling.value ||
    !!room ||
    directCallRecoveryRoomId === activeRoomId;

  return !!(activeRoomId && matchesCurrentCall && hasCallRuntime);
};

const resolveDirectCallRecoverySuccess = (activeRoom: Room | null = room) => {
  if (!directCallRecoveryRoomId) {
    return;
  }

  const requiresRemoteParticipant = isRecoverableDirectCallSession(
    directCallRecoveryRoomId,
    directCallRecoveryTopicId
  );
  const recovered =
    !!activeRoom &&
    roomId.value === directCallRecoveryRoomId &&
    (!directCallRecoveryTopicId ||
      topicId.value === directCallRecoveryTopicId) &&
    activeRoom.state === ConnectionState.Connected &&
    (!requiresRemoteParticipant || activeRoom.remoteParticipants.size > 0);

  if (!recovered) {
    return;
  }

  recordCallTelemetryEvent('call.direct_recovery.completed', {
    ...buildCallHealthTelemetryPayload(activeRoom),
    attemptCount: directCallRecoveryAttemptCount,
    recoveryDurationMs: directCallRecoveryStartedAt
      ? Date.now() - directCallRecoveryStartedAt
      : null
  });
  clearCallIssueSignal();
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

const shouldRecordDirectCallRecoveryAttemptTelemetry = (): boolean => {
  const now = Date.now();

  if (
    directCallRecoveryAttemptCount === 1 ||
    now - lastDirectCallRecoveryAttemptTelemetryAt >=
      DIRECT_CALL_RECOVERY_TELEMETRY_INTERVAL_MS
  ) {
    lastDirectCallRecoveryAttemptTelemetryAt = now;
    return true;
  }

  return false;
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
    !isRecoverableActiveCallSession(activeRoomId, activeTopicId)
  ) {
    resetDirectCallRecoveryState();
    return;
  }

  directCallRecoveryInFlight = true;
  directCallRecoveryAttemptCount += 1;
  const attemptNumber = directCallRecoveryAttemptCount;

  try {
    const status = await getRawLiveKitCallStatus(activeRoomId);

    if (attemptId !== directCallRecoveryAttemptId) {
      return;
    }

    if (!status) {
      if (shouldRecordDirectCallRecoveryAttemptTelemetry()) {
        recordCallTelemetryEvent(
          'call.direct_recovery.status_unavailable',
          buildCallRecoveryTelemetryPayload('status-unavailable', room, {
            targetRoomId: activeRoomId,
            targetTopicId: activeTopicId,
            attemptNumber
          }),
          'warn'
        );
      }
      scheduleDirectCallRecoveryAttempt(attemptId);
      return;
    }

    if (status.topicId && activeTopicId && status.topicId !== activeTopicId) {
      recordCallTelemetryEvent(
        'call.direct_recovery.topic_mismatch',
        {
          targetRoomId: activeRoomId,
          targetTopicId: activeTopicId,
          statusTopicId: status.topicId,
          attemptNumber
        },
        'error'
      );
      resetDirectCallRecoveryState(true, attemptId);
      showTransientCallStatusNotice(DIRECT_CALL_RECONNECT_FAILED_NOTICE);
      return;
    }

    if (!status?.active) {
      recordCallTelemetryEvent(
        'call.direct_recovery.server_inactive',
        {
          targetRoomId: activeRoomId,
          targetTopicId: activeTopicId,
          attemptNumber,
          statusTopicId: status.topicId ?? null
        },
        'warn'
      );
      resetDirectCallRecoveryState(true, attemptId);
      clearUnavailableCallState(activeRoomId, activeTopicId);
      showTransientCallStatusNotice(
        DIRECT_CALL_ENDED_NOTICE,
        ENDED_CALL_STATUS_NOTICE_CLOSE_DELAY_MS,
        'ended'
      );
      return;
    }

    const recoveredTimerSnapshot = selectLongestCallTimerSnapshot(
      getCurrentCallTimerSnapshot(),
      {
        startTime: status.startTime ?? null,
        elapsedDurationMs: status.elapsedDurationMs ?? 0
      },
      getMatchingPersistedCallTimerSnapshot(activeRoomId, activeTopicId)
    );

    if (hasCallTimerSnapshotProgress(recoveredTimerSnapshot)) {
      setCallStartedAt(
        recoveredTimerSnapshot.startTime,
        recoveredTimerSnapshot.elapsedDurationMs
      );
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
        if (shouldRecordDirectCallRecoveryAttemptTelemetry()) {
          recordCallTelemetryEvent(
            'call.direct_recovery.livekit_connect_failed',
            {
              targetRoomId: activeRoomId,
              targetTopicId: activeTopicId,
              attemptNumber,
              ...getTelemetryErrorPayload(error)
            },
            'warn'
          );
        }
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

    scheduleDirectCallRecoveryAttempt(attemptId);
  } catch (error) {
    if (attemptId !== directCallRecoveryAttemptId) {
      return;
    }

    if (shouldRecordDirectCallRecoveryAttemptTelemetry()) {
      recordCallTelemetryEvent(
        'call.direct_recovery.attempt_failed',
        {
          targetRoomId: activeRoomId,
          targetTopicId: activeTopicId,
          attemptNumber,
          ...getTelemetryErrorPayload(error)
        },
        'warn'
      );
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
    !isRecoverableActiveCallSession(activeRoomId, activeTopicId) ||
    isOutgoingDialingCall()
  ) {
    return false;
  }

  directCallRecoveryAttemptId += 1;
  directCallRecoveryInFlight = false;
  directCallRecoveryAttemptCount = 0;
  directCallRecoveryStartedAt = Date.now();
  lastDirectCallRecoveryAttemptTelemetryAt = 0;
  directCallRecoveryRoomId = activeRoomId;
  directCallRecoveryTopicId = activeTopicId;
  const requiresRemoteParticipant = isRecoverableDirectCallSession(
    activeRoomId,
    activeTopicId
  );
  directCallRecoveryWaitForRemote =
    requiresRemoteParticipant &&
    (!!options.waitForRemote || remoteReconnectingParticipants.size > 0);
  markCallIssueSignal('call.direct_recovery.started', 'hard', {
    reason: options.reason ?? null
  });
  recordCallTelemetryEvent(
    'call.direct_recovery.started',
    buildCallRecoveryTelemetryPayload(options.reason, room, {
      targetRoomId: activeRoomId,
      targetTopicId: activeTopicId,
      waitForRemote: directCallRecoveryWaitForRemote,
      groupMode: !requiresRemoteParticipant,
      remoteUserId: options.remoteUserId ?? null,
      remoteReconnectingParticipantCount: remoteReconnectingParticipants.size
    }),
    'warn'
  );
  showReconnectCallStatusNotice();
  ensureCallTimerContinues();
  isCalling.value = false;
  open.value = true;
  // Preserve the user's minimized state while the call reconnects.
  clearDirectCallRecoveryTimer();
  void recoverDirectCallConnection(directCallRecoveryAttemptId);
  return true;
};

const resetPendingEndCallState = () => {
  clearPendingEndCallTimers();
  pendingEndCallRoomId.value = null;
  pendingEndCallTopicId.value = null;
  pendingEndCallAcknowledged = false;
};

const emitEndCallEvent = async (
  targetRoomId?: string | null,
  targetTopicId?: string | null,
  source = 'unknown',
  payload: Record<string, unknown> = {}
): Promise<boolean> => {
  const sdk = getChatSDK();
  const me = getAuthUser();
  const telemetryPayload = {
    ...buildCallHealthTelemetryPayload(),
    ...payload
  };

  if (!sdk || !me || !targetRoomId) {
    recordCallTelemetryEvent(
      'call.end.send_skipped',
      {
        targetRoomId,
        targetTopicId,
        source,
        hasSdk: Boolean(sdk),
        hasUser: Boolean(me),
        ...telemetryPayload
      },
      'warn'
    );
    return false;
  }

  try {
    recordCallTelemetryEvent(
      'call.end.send_attempted',
      {
        targetRoomId,
        targetTopicId,
        source,
        senderUserId: me.id,
        ...telemetryPayload
      },
      'warn'
    );

    const ack = await sdk.sendWebSocketEventWithAck<
      WebSocketEventType.END_CALL,
      CallSocketAck
    >(
      WebSocketEventType.END_CALL,
      {
        roomId: targetRoomId,
        topicId: targetTopicId,
        userId: me.id
      },
      END_CALL_ACK_TIMEOUT_MS
    );

    if (ack?.accepted !== true) {
      recordCallTelemetryEvent(
        'call.end.ack_rejected',
        {
          targetRoomId,
          targetTopicId,
          source,
          senderUserId: me.id,
          ackAccepted: ack?.accepted ?? null,
          ...telemetryPayload
        },
        'warn'
      );
      return false;
    }

    recordCallTelemetryEvent('call.end.sent', {
      targetRoomId,
      targetTopicId,
      source,
      senderUserId: me.id,
      acknowledged: true,
      ...telemetryPayload
    });

    return true;
  } catch (error) {
    recordCallTelemetryEvent(
      'call.end.send_failed',
      {
        targetRoomId,
        targetTopicId,
        source,
        senderUserId: me.id,
        ...telemetryPayload,
        ...getTelemetryErrorPayload(error)
      },
      'error'
    );
    return false;
  }
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
  pendingEndCallAcknowledged = false;
  recordCallTelemetryEvent(
    'call.end.pending_confirmation_scheduled',
    {
      targetRoomId,
      targetTopicId
    },
    'warn'
  );

  pendingEndCallRetryTimeout = setTimeout(() => {
    if (
      pendingEndCallRoomId.value === targetRoomId &&
      pendingEndCallTopicId.value === targetTopicId &&
      !pendingEndCallAcknowledged
    ) {
      void emitEndCallEvent(
        targetRoomId,
        targetTopicId,
        'pending_confirmation_retry'
      ).then(acknowledged => {
        if (
          acknowledged &&
          pendingEndCallRoomId.value === targetRoomId &&
          pendingEndCallTopicId.value === targetTopicId
        ) {
          pendingEndCallAcknowledged = true;
        }
      });
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
  targetRoomId?: string | null,
  options: { includeRoomState?: boolean; inviteToken?: string } = {}
): Promise<LiveKitCallStatus | null> => {
  if (!targetRoomId) {
    return null;
  }

  const sdk = getChatSDK();
  if (!sdk) {
    return null;
  }

  const inviteToken = options.inviteToken ?? getCallInviteToken(targetRoomId);
  const status = await sdk.getLiveKitCallStatus(targetRoomId, {
    ...options,
    inviteToken
  });
  if (!status) {
    return null;
  }

  return status;
};

const getLiveKitCallStatus = async (
  targetRoomId?: string | null,
  targetTopicId?: string | null,
  options: { inviteToken?: string } = {}
): Promise<LiveKitCallStatus | null> => {
  const status = await getRawLiveKitCallStatus(targetRoomId, options);

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
          startTime: resolveCallStartTime(status.startTime, startTime),
          participantCount: status.participantCount,
          groupMode: status.groupMode,
          elapsedDurationMs: status.elapsedDurationMs
        }
      };
    })();
  }, 3000);
};

const getInviteParamsFromUrl = () => {
  if (typeof window === 'undefined') return null;

  const invite = parseGroupCallInviteUrl(window.location.href, {
    allowTrustedNativeOrigin: Capacitor.isNativePlatform()
  });

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

const getElapsedCallDurationMs = () =>
  callElapsedMs.value +
  (callStartedAt.value ? Date.now() - callStartedAt.value : 0);

const resolveCallStartTime = (
  ...values: Array<number | null | undefined>
): number | null => {
  for (const value of values) {
    if (value !== undefined) {
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    }
  }

  return null;
};

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

const waitForInvitedGroupCallConnectRetry = () =>
  new Promise<void>(resolve => {
    setTimeout(resolve, INVITED_GROUP_CALL_CONNECT_RETRY_DELAY_MS);
  });

const isConnectedToTargetCall = (
  targetRoomId: string,
  targetTopicId?: string | null
): boolean =>
  roomId.value === targetRoomId &&
  (!targetTopicId || topicId.value === targetTopicId) &&
  !!room &&
  room.state === ConnectionState.Connected;

const prepareInvitedGroupCallJoinState = async (
  invite: InvitedGroupCallEntry,
  callStatus: LiveKitCallStatus,
  me: IUser
) => {
  user.value = me as any;
  roomId.value = invite.roomId;
  topicId.value = invite.topicId;
  setCallStartedAt(
    resolveCallStartTime(callStatus.startTime, invite.startTime),
    callStatus.elapsedDurationMs ?? invite.elapsedDurationMs ?? 0
  );
  await applyDefaultAudioOutputRoute();
  open.value = true;
  isIncoming.value = false;
  isCalling.value = true;
  isModalVisible.value = true;
  isAcceptingLocally = true;
  localAcceptRoomId = invite.roomId;
  localAcceptTopicId = invite.topicId;
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
    const fallbackSnapshot = getActiveCallTimerSnapshotFallback();

    if (fallbackSnapshot) {
      setCallStartedAt(
        fallbackSnapshot.startTime ?? Date.now(),
        fallbackSnapshot.elapsedDurationMs
      );
    } else {
      callStartedAt.value = Date.now();
    }
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
  if (
    localScreenTrack instanceof LocalVideoTrack &&
    localScreenTrack.mediaStreamTrack.readyState === 'live'
  ) {
    rememberLocalScreenShareTrack(localScreenTrack);
  }
  const recoverableLocalScreenTrack = getRecoverableLocalScreenShareTrack();
  const isLocalScreenSharePublished =
    !!localScreenSharePublication &&
    !localScreenSharePublication.isMuted &&
    localScreenTrack?.mediaStreamTrack?.readyState !== 'ended';
  state.isScreenSharingActive =
    isLocalScreenSharePublished ||
    (shouldRecoverLocalScreenShare && !!recoverableLocalScreenTrack);
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
      const isExpectedStop =
        isStoppingScreenShare || isStoppingAndroidScreenShare;

      recordCallTelemetryEvent(
        'call.screen_share.media_track_ended',
        {
          reason: isExpectedStop ? 'expected-stop' : 'browser-track-ended',
          trackSid: localScreenSharePublication?.trackSid ?? null,
          mediaTrackId: localScreenTrack.mediaStreamTrack.id,
          mediaTrackReadyState: localScreenTrack.mediaStreamTrack.readyState,
          documentVisibility:
            typeof document !== 'undefined' ? document.visibilityState : null,
          documentHasFocus:
            typeof document !== 'undefined' ? document.hasFocus() : null
        },
        'warn'
      );

      if (!isExpectedStop) {
        clearLocalScreenShareRecoveryState();
        syncLocalTrackState();
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
    localScreenTrack?.mediaStreamTrack ||
      recoverableLocalScreenTrack?.mediaStreamTrack
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

const isConstrainedConnectionQuality = (quality: ConnectionQuality | string) =>
  quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost;

const getConstrainedVideoQuality = (
  quality: ConnectionQuality | string
): VideoQuality | null => {
  if (quality === ConnectionQuality.Lost) {
    return VideoQuality.LOW;
  }

  if (quality === ConnectionQuality.Poor) {
    return VideoQuality.MEDIUM;
  }

  return null;
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
  const constrainedQuality = getConstrainedVideoQuality(
    state.connectionQuality
  );
  publication.setVideoFPS(
    constrainedQuality !== null
      ? source === 'screen'
        ? 5
        : 15
      : source === 'screen'
        ? 30
        : 24
  );

  if (constrainedQuality !== null) {
    publication.setVideoQuality(constrainedQuality);
    return;
  }

  const dimensions = element ? buildRequestedVideoDimensions(element) : null;

  if (dimensions) {
    publication.setVideoDimensions(dimensions);
    return;
  }

  publication.setVideoQuality(
    source === 'screen' ? VideoQuality.HIGH : VideoQuality.LOW
  );
};

const syncRemoteVideoSubscriptionPreferences = () => {
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

const clearLocalVideoQualityRecovery = () => {
  if (!localVideoQualityRecoveryTimeout) {
    return;
  }

  clearTimeout(localVideoQualityRecoveryTimeout);
  localVideoQualityRecoveryTimeout = null;
};

const setLocalVideoPublishingQuality = (
  activeRoom: Room,
  maxQuality: VideoQuality,
  reason: string
) => {
  const didQualityChange = localVideoPublishingQuality !== maxQuality;
  localVideoPublishingQuality = maxQuality;

  activeRoom.localParticipant.videoTrackPublications.forEach(publication => {
    if (publication.source === Track.Source.Camera) {
      publication.videoTrack?.setPublishingQuality(maxQuality);
    }
  });

  syncRemoteVideoSubscriptionPreferences();

  if (didQualityChange) {
    recordCallTelemetryEvent('call.media_quality.changed', {
      reason,
      maxVideoQuality: maxQuality,
      connectionQuality: state.connectionQuality
    });
  }
};

const adaptMediaQualityToConnection = (
  activeRoom: Room,
  quality: ConnectionQuality
) => {
  const constrainedQuality = getConstrainedVideoQuality(quality);

  if (constrainedQuality !== null) {
    clearLocalVideoQualityRecovery();
    setLocalVideoPublishingQuality(activeRoom, constrainedQuality, quality);
    return;
  }

  if (
    quality !== ConnectionQuality.Good &&
    quality !== ConnectionQuality.Excellent &&
    quality !== ConnectionQuality.Unknown
  ) {
    syncRemoteVideoSubscriptionPreferences();
    return;
  }

  if (localVideoPublishingQuality === VideoQuality.HIGH) {
    setLocalVideoPublishingQuality(activeRoom, VideoQuality.HIGH, quality);
    return;
  }

  if (localVideoQualityRecoveryTimeout) {
    return;
  }

  localVideoQualityRecoveryTimeout = setTimeout(() => {
    localVideoQualityRecoveryTimeout = null;

    if (
      room !== activeRoom ||
      isConstrainedConnectionQuality(state.connectionQuality)
    ) {
      return;
    }

    setLocalVideoPublishingQuality(
      activeRoom,
      VideoQuality.HIGH,
      'connection-recovered'
    );
  }, LOCAL_VIDEO_QUALITY_RECOVERY_DELAY_MS);
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
  remoteReconnectingParticipants.delete(identity);
};

const clearRemoteReconnectingParticipants = () => {
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

  remoteReconnectingParticipants.set(participant.identity, {
    participant
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
  recordRemoteParticipantLossIfNeeded(
    'sync-remote-participant-state',
    activeRoom
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

const enforceSingleScreenShare = async (
  activeRoom: Room,
  publication: TrackPublication,
  participant: Participant,
  trigger:
    | 'remote-track-published'
    | 'remote-track-subscribed'
    | 'remote-track-unmuted'
) => {
  if (
    room !== activeRoom ||
    !state.isScreenSharingActive ||
    publication.source !== Track.Source.ScreenShare ||
    publication.isMuted ||
    !activeRoom.remoteParticipants.has(participant.identity)
  ) {
    return;
  }

  recordCallTelemetryEvent(
    'call.screen_share.stop_requested',
    {
      reason: 'remote-share-conflict',
      trigger,
      remoteParticipantId: participant.identity,
      remoteTrackSid: publication.trackSid,
      remoteTrackReadyState:
        publication.track?.mediaStreamTrack?.readyState ?? null
    },
    'warn'
  );

  clearLocalScreenShareRecoveryState();
  state.isScreenSharingActive = false;
  isStoppingScreenShare = true;

  try {
    await activeRoom.localParticipant.setScreenShareEnabled(false);
    recordCallTelemetryEvent('call.screen_share.stop_completed', {
      reason: 'remote-share-conflict',
      trigger,
      remoteParticipantId: participant.identity,
      remoteTrackSid: publication.trackSid
    });
  } catch (error) {
    recordCallTelemetryEvent(
      'call.screen_share.stop_failed',
      {
        reason: 'remote-share-conflict',
        trigger,
        remoteParticipantId: participant.identity,
        remoteTrackSid: publication.trackSid,
        ...getTelemetryErrorPayload(error)
      },
      'error'
    );
  } finally {
    isStoppingScreenShare = false;
    syncLocalTrackState();
  }
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
    await microphoneTrack.applyConstraints(
      getSupportedCallAudioCaptureOptions()
    );
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
    getSupportedCallAudioCaptureOptions()
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

  if (hasRemoteParticipant || callStartedAt.value !== null) {
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
    .on(RoomEvent.TrackPublished, (publication, participant) => {
      syncRemoteParticipantState();
      syncConnectionState(activeRoom);
      syncRemoteVideoSubscriptionPreferences();
      scheduleCallAudioRecovery(activeRoom);
      void enforceSingleScreenShare(
        activeRoom,
        publication,
        participant,
        'remote-track-published'
      );
    })
    .on(RoomEvent.TrackUnpublished, () => {
      syncRemoteParticipantState();
      syncConnectionState(activeRoom);
      scheduleCallAudioRecovery(activeRoom);
    })
    .on(RoomEvent.TrackSubscribed, (_, publication, participant) => {
      syncRemoteParticipantState();
      syncConnectionState(activeRoom);
      syncRemoteVideoSubscriptionPreferences();
      scheduleCallAudioRecovery(activeRoom);
      resolveDirectCallRecoverySuccess(activeRoom);
      void enforceSingleScreenShare(
        activeRoom,
        publication,
        participant,
        'remote-track-subscribed'
      );
    })
    .on(RoomEvent.TrackUnsubscribed, () => {
      syncRemoteParticipantState();
      syncConnectionState(activeRoom);
      scheduleCallAudioRecovery(activeRoom);
    })
    .on(RoomEvent.TrackMuted, (publication, participant) => {
      syncLocalTrackState();
      syncLocalParticipantSpeakingState(activeRoom);
      syncRemoteParticipantState();
      scheduleCallAudioRecovery(activeRoom);
      if (
        participant.identity === activeRoom.localParticipant.identity &&
        publication.source === Track.Source.ScreenShare &&
        shouldRecoverLocalScreenShare &&
        !isStoppingScreenShare
      ) {
        rememberLocalScreenShareTrack(publication.track);
        scheduleLocalScreenShareRecovery('local-track-muted');
      }
    })
    .on(RoomEvent.TrackUnmuted, (publication, participant) => {
      syncLocalTrackState();
      syncLocalParticipantSpeakingState(activeRoom);
      syncRemoteParticipantState();
      syncRemoteVideoSubscriptionPreferences();
      scheduleCallAudioRecovery(activeRoom);
      void enforceSingleScreenShare(
        activeRoom,
        publication,
        participant,
        'remote-track-unmuted'
      );
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
      persistActiveCallSession();
      recordCallTelemetryEvent('call.participant.connected', {
        participantId: participant.identity,
        remoteParticipantCount: activeRoom.remoteParticipants.size
      });
      syncRemoteVideoSubscriptionPreferences();
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
      persistActiveCallSession();
      const isLastDirectRemoteParticipant =
        !activeRoom.remoteParticipants.size &&
        !isGroupCallSession(topicId.value);

      if (isLastDirectRemoteParticipant) {
        markCallIssueSignal('call.participant.disconnected', 'hard', {
          reason: 'last-direct-remote-participant-disconnected'
        });
      }

      recordCallTelemetryEvent(
        'call.participant.disconnected',
        {
          participantId: participant.identity,
          remoteParticipantCount: activeRoom.remoteParticipants.size,
          ...buildCallHealthTelemetryPayload(activeRoom)
        },
        'warn'
      );
      recordRemoteParticipantLossIfNeeded(
        'participant-disconnected',
        activeRoom
      );

      if (
        !activeRoom.remoteParticipants.size &&
        !isGroupCallSession(topicId.value)
      ) {
        startDirectCallRecovery(roomId.value, topicId.value, {
          waitForRemote: true,
          reason: 'participant-disconnected'
        });
      }

      showGroupCallPresenceNotification(participant, 'left', activeRoom);
    })
    .on(RoomEvent.LocalTrackPublished, publication => {
      if (publication.source === Track.Source.ScreenShare) {
        shouldRecoverLocalScreenShare = true;
        rememberLocalScreenShareTrack(publication.track);
      }
      syncLocalTrackState();
      if (publication.source === Track.Source.ScreenShare) {
        recordCallTelemetryEvent('call.screen_share.local_published', {
          trackSid: publication.trackSid,
          mediaTrackId: publication.track?.mediaStreamTrack?.id ?? null,
          mediaTrackReadyState:
            publication.track?.mediaStreamTrack?.readyState ?? null,
          recoveryRequested: shouldRecoverLocalScreenShare,
          recoveryAttemptCount: screenShareRecoveryAttemptCount
        });
      }
      if (publication.source === Track.Source.Camera) {
        setLocalVideoPublishingQuality(
          activeRoom,
          localVideoPublishingQuality,
          'track-published'
        );
      }
      scheduleCallAudioRecovery(activeRoom);
      if (
        publication.source === Track.Source.ScreenShare ||
        publication.source === Track.Source.ScreenShareAudio
      ) {
        void ensureLocalMicrophoneState(activeRoom);
      }
    })
    .on(RoomEvent.LocalTrackUnpublished, publication => {
      const isRecoverableScreenShareUnpublish =
        publication.source === Track.Source.ScreenShare &&
        shouldRecoverLocalScreenShare &&
        !isStoppingScreenShare &&
        !isStoppingAndroidScreenShare &&
        !isExplicitHangupInProgress;

      if (isRecoverableScreenShareUnpublish) {
        rememberLocalScreenShareTrack(publication.track);
      }
      syncLocalTrackState();
      if (publication.source === Track.Source.ScreenShare) {
        recordCallTelemetryEvent(
          'call.screen_share.local_unpublished',
          {
            trackSid: publication.trackSid,
            mediaTrackId: publication.track?.mediaStreamTrack?.id ?? null,
            mediaTrackReadyState:
              publication.track?.mediaStreamTrack?.readyState ?? null,
            expectedStop: !isRecoverableScreenShareUnpublish,
            recoveryScheduled: isRecoverableScreenShareUnpublish,
            documentVisibility:
              typeof document !== 'undefined' ? document.visibilityState : null,
            documentHasFocus:
              typeof document !== 'undefined' ? document.hasFocus() : null
          },
          'warn'
        );

        if (isRecoverableScreenShareUnpublish) {
          scheduleLocalScreenShareRecovery('local-track-unpublished');
        }
      }
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
    .on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      const previousLocalConnectionQuality = state.connectionQuality;
      syncLocalParticipantSpeakingState(activeRoom);
      syncRemoteParticipantState();
      if (participant.identity === activeRoom.localParticipant.identity) {
        adaptMediaQualityToConnection(activeRoom, quality);

        if (quality === ConnectionQuality.Lost) {
          markCallIssueSignal('call.connection_quality.lost', 'soft');
          showReconnectCallStatusNotice();
          recordCallTelemetryEvent(
            'call.connection_quality.lost',
            buildCallHealthTelemetryPayload(activeRoom),
            'warn'
          );
        } else if (
          (quality === ConnectionQuality.Good ||
            quality === ConnectionQuality.Excellent) &&
          activeRoom.state === ConnectionState.Connected &&
          !directCallRecoveryRoomId &&
          !activeCallNetworkRecoveryPromise &&
          callStatusNoticeKind.value === 'reconnecting'
        ) {
          clearCallStatusNotice();
          clearCallIssueSignal('soft');
        }

        if (
          (previousLocalConnectionQuality === ConnectionQuality.Poor ||
            previousLocalConnectionQuality === ConnectionQuality.Lost) &&
          (quality === ConnectionQuality.Good ||
            quality === ConnectionQuality.Excellent)
        ) {
          recordCallTelemetryEvent('call.connection_quality.recovered', {
            previousConnectionQuality: previousLocalConnectionQuality,
            connectionQuality: quality,
            ...buildCallHealthTelemetryPayload(activeRoom)
          });
        }
      }
      recordCallConnectionQualityIfChanged();
    })
    .on(RoomEvent.Reconnecting, () => {
      if (isExplicitHangupInProgress) {
        return;
      }

      markCallIssueSignal('call.livekit.reconnecting', 'soft');
      recordCallTelemetryEvent(
        'call.livekit.reconnecting',
        buildCallHealthTelemetryPayload(activeRoom),
        'warn'
      );
      showReconnectCallStatusNotice();
      setLocalVideoPublishingQuality(
        activeRoom,
        VideoQuality.LOW,
        'reconnecting'
      );
      syncLocalTrackState();
      syncLocalParticipantSpeakingState(activeRoom);
      syncRemoteParticipantState();
      syncConnectionState(activeRoom);
      persistActiveCallSession();
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
      adaptMediaQualityToConnection(
        activeRoom,
        activeRoom.localParticipant.connectionQuality
      );
      scheduleCallAudioRecovery(activeRoom);
      scheduleLocalScreenShareRecovery('livekit-reconnected');
      resolveDirectCallRecoverySuccess(activeRoom);
      void ensureLocalMicrophoneState(activeRoom);
      recordCallTelemetryEvent(
        'call.livekit.reconnected',
        buildCallHealthTelemetryPayload(activeRoom)
      );
      clearCallIssueSignal('soft');
    })
    .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      if (ignoredDisconnectedRoom === activeRoom) {
        if (room === activeRoom) {
          room = null;
        }
        ignoredDisconnectedRoom = null;
        recordCallTelemetryEvent('call.livekit.disconnected.ignored', {
          reason
        });
        return;
      }

      if (isExplicitHangupInProgress) {
        if (room === activeRoom) {
          room = null;
        }
        recordCallTelemetryEvent('call.livekit.disconnected.explicit', {
          reason
        });
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
        recordCallTelemetryEvent(
          'call.livekit.disconnected.duplicate_identity',
          { reason },
          'warn'
        );
        return;
      }

      if (matchesPendingEndCall(roomId.value, topicId.value)) {
        recordCallTelemetryEvent('call.livekit.disconnected.pending_end', {
          reason
        });
        return;
      }

      if (room === activeRoom) {
        room = null;
      }

      if (
        startDirectCallRecovery(roomId.value, topicId.value, {
          waitForRemote: true,
          reason: 'livekit-disconnected'
        })
      ) {
        recordCallTelemetryEvent(
          'call.livekit.disconnected.recovery_started',
          {
            reason,
            ...buildCallHealthTelemetryPayload(activeRoom)
          },
          'warn'
        );
        return;
      }

      markCallIssueSignal('call.livekit.disconnected', 'hard', {
        reason: reason ? String(reason) : null
      });
      recordCallTelemetryEvent(
        'call.livekit.disconnected',
        {
          reason,
          ...buildCallHealthTelemetryPayload(activeRoom)
        },
        'error'
      );
      cleanup(false);
    });
};

const getToken = async (activeRoomId: string, inviteToken?: string) => {
  const sdk = getChatSDK();
  if (!sdk) return null;

  const resolvedInviteToken = inviteToken ?? getCallInviteToken(activeRoomId);
  if (resolvedInviteToken) {
    return sdk.getInviteLiveKitToken(activeRoomId, resolvedInviteToken);
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

const connectToRoom = async (options: { inviteToken?: string } = {}) => {
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
      recordCallTelemetryEvent(
        'call.connect.config_incomplete',
        {
          hasSdk: Boolean(sdk),
          hasUser: Boolean(me),
          hasRoomId: Boolean(activeRoomId),
          hasLiveKitUrl: Boolean(config?.CHAT_LIVEKIT_URL),
          attemptId: currentAttemptId
        },
        'error'
      );
      throw new Error('LiveKit config is incomplete');
    }

    const tokenStartedAt = Date.now();
    recordCallTelemetryEvent('call.token.start', {
      attemptId: currentAttemptId,
      roomId: activeRoomId,
      topicId: activeTopicId
    });

    const token = await getToken(activeRoomId, options.inviteToken);
    if (!token) {
      const callStatus = await sdk.getLiveKitCallStatus(activeRoomId, {
        inviteToken: options.inviteToken
      });
      recordCallTelemetryEvent(
        'call.token.failed',
        {
          attemptId: currentAttemptId,
          elapsedMs: Date.now() - tokenStartedAt,
          callActive: callStatus?.active,
          statusTopicId: callStatus?.topicId
        },
        'error'
      );
      if (
        !callStatus?.active ||
        (activeTopicId !== null && callStatus.topicId !== activeTopicId)
      ) {
        throw new Error('Call is no longer active');
      }

      throw new Error('Failed to get LiveKit token');
    }

    recordCallTelemetryEvent('call.token.success', {
      attemptId: currentAttemptId,
      elapsedMs: Date.now() - tokenStartedAt
    });

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
      reconnectPolicy: LIVEKIT_RECONNECT_POLICY,
      publishDefaults: {
        ...CAMERA_PUBLISH_DEFAULTS,
        ...SCREEN_SHARE_PUBLISH_DEFAULTS
      },
      audioCaptureDefaults: getSupportedCallAudioCaptureOptions(),
      videoCaptureDefaults: CAMERA_CAPTURE_DEFAULTS
    });
    room = nextRoom;

    setupRoomListeners(nextRoom);

    try {
      const connectStartedAt = Date.now();
      recordCallTelemetryEvent('call.livekit.connect.start', {
        attemptId: currentAttemptId,
        liveKitUrl: config.CHAT_LIVEKIT_URL
      });

      await nextRoom.connect(config.CHAT_LIVEKIT_URL, token, {
        maxRetries: 3,
        peerConnectionTimeout: 20_000,
        websocketTimeout: 20_000
      });
      recordCallTelemetryEvent('call.livekit.connect.success', {
        attemptId: currentAttemptId,
        elapsedMs: Date.now() - connectStartedAt
      });
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
        recordCallTelemetryEvent(
          'call.livekit.connect.aborted',
          {
            attemptId: currentAttemptId,
            ...getTelemetryErrorPayload(error)
          },
          'warn'
        );
        return;
      }

      const isCallRecovery =
        directCallRecoveryRoomId === activeRoomId &&
        (!activeTopicId || directCallRecoveryTopicId === activeTopicId);

      markCallIssueSignal('call.livekit.connect_failed', 'hard', {
        reason: 'connect_failure'
      });
      showReconnectCallStatusNotice();
      if (!isCallRecovery) {
        startDirectCallRecovery(activeRoomId, activeTopicId, {
          waitForRemote: true,
          reason: 'connect-failure'
        });
      }

      recordCallTelemetryEvent(
        isCallRecovery
          ? 'call.livekit.connect.recovery_failed'
          : 'call.livekit.connect.preserved_failed',
        {
          attemptId: currentAttemptId,
          ...getTelemetryErrorPayload(error)
        },
        'error'
      );
      throw error;
    }

    if (currentAttemptId !== connectAttemptId || room !== nextRoom) {
      nextRoom.disconnect();
      return;
    }

    await applyCurrentAudioOutputRoute();

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
    persistActiveCallSession(activeRoomId, activeTopicId, options.inviteToken);
    recordCallConnectionQualityIfChanged();
    adaptMediaQualityToConnection(
      nextRoom,
      nextRoom.localParticipant.connectionQuality
    );
    scheduleCallAudioRecovery(nextRoom);
    resolveDirectCallRecoverySuccess(nextRoom);
    suppressParticipantPresenceNotifications = false;
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

const connectInvitedGroupCallWithRetry = async (
  invite: InvitedGroupCallEntry,
  me: IUser,
  initialCallStatus: LiveKitCallStatus,
  attempt = 1,
  previousError: unknown = null
): Promise<boolean> => {
  const callStatus =
    attempt === 1
      ? initialCallStatus
      : await getLiveKitCallStatus(invite.roomId, invite.topicId, {
          inviteToken: invite.inviteToken
        });

  if (!callStatus?.active) {
    clearUnavailableCallState(invite.roomId, invite.topicId);
    showTransientCallStatusNotice(DIRECT_CALL_ENDED_NOTICE);
    return false;
  }

  if (attempt > 1) {
    await prepareInvitedGroupCallJoinState(invite, callStatus, me);
    resetCallTelemetryState();
    ensureCallTelemetryTraceId();
    recordCallTelemetryEvent('call.join.invite_connect_retry', {
      invited: true,
      groupMode: true,
      inviteRoomId: invite.roomId,
      inviteTopicId: invite.topicId,
      attempt,
      maxAttempts: INVITED_GROUP_CALL_CONNECT_ATTEMPTS
    });
  }

  let connectError: unknown = null;

  try {
    await connectToRoom({ inviteToken: invite.inviteToken });
  } catch (error) {
    connectError = error;
  }

  if (isConnectedToTargetCall(invite.roomId, invite.topicId)) {
    return true;
  }

  const errorPayload = connectError
    ? getTelemetryErrorPayload(connectError)
    : previousError
      ? getTelemetryErrorPayload(previousError)
      : {};

  if (attempt >= INVITED_GROUP_CALL_CONNECT_ATTEMPTS) {
    recordCallTelemetryEvent(
      'call.join.invite_connect_failed',
      {
        invited: true,
        groupMode: true,
        inviteRoomId: invite.roomId,
        inviteTopicId: invite.topicId,
        attempt,
        maxAttempts: INVITED_GROUP_CALL_CONNECT_ATTEMPTS,
        liveKitState: room?.state ?? null,
        hasRoom: Boolean(room),
        ...errorPayload
      },
      'error'
    );
    showErrorNotification(
      getConnectErrorMessage(connectError ?? previousError)
    );
    return false;
  }

  recordCallTelemetryEvent(
    'call.join.invite_connect_retry_scheduled',
    {
      invited: true,
      groupMode: true,
      inviteRoomId: invite.roomId,
      inviteTopicId: invite.topicId,
      attempt,
      nextAttempt: attempt + 1,
      maxAttempts: INVITED_GROUP_CALL_CONNECT_ATTEMPTS,
      liveKitState: room?.state ?? null,
      hasRoom: Boolean(room),
      ...errorPayload
    },
    'warn'
  );

  await waitForInvitedGroupCallConnectRetry();
  return connectInvitedGroupCallWithRetry(
    invite,
    me,
    callStatus,
    attempt + 1,
    connectError ?? previousError
  );
};

const shouldReconnectLiveKitRoom = (activeRoom: Room | null): boolean =>
  !activeRoom || activeRoom.state === ConnectionState.Disconnected;

const isPassiveCallRecoveryReason = (reason?: string): boolean =>
  reason === 'window-focus' ||
  reason === 'app-visible' ||
  reason === 'network-poll';

const recoverActiveCallMediaState = async (
  activeRoom: Room | null = room
): Promise<void> => {
  if (!activeRoom) {
    syncLocalTrackState();
    syncRemoteParticipantState();
    return;
  }

  syncLocalTrackState();
  syncLocalParticipantSpeakingState(activeRoom);
  syncRemoteParticipantState();
  syncConnectionState(activeRoom);
  adaptMediaQualityToConnection(
    activeRoom,
    activeRoom.localParticipant.connectionQuality
  );
  scheduleCallAudioRecovery(activeRoom);
  await ensureLocalMicrophoneState(activeRoom);
  await recoverLocalScreenSharePublication(activeRoom, 'call-media-recovery');
};

const recoverActiveCallAfterNetworkChangeInternal = async (
  reason = 'network-change'
): Promise<boolean> => {
  const activeRoomId = roomId.value || directCallRecoveryRoomId;
  const activeTopicId = topicId.value || directCallRecoveryTopicId;
  const hasRecoverableCall =
    !!activeRoomId &&
    (open.value ||
      isModalVisible.value ||
      isIncoming.value ||
      isCalling.value ||
      !!room ||
      !!directCallRecoveryRoomId);

  if (
    !hasRecoverableCall ||
    isExplicitHangupInProgress ||
    matchesPendingEndCall(activeRoomId, activeTopicId)
  ) {
    return false;
  }

  recordCallTelemetryEvent(
    'call.network_recovery.start',
    {
      ...buildCallRecoveryTelemetryPayload(reason),
      ...buildCallHealthTelemetryPayload()
    },
    'warn'
  );

  const status = await getRawLiveKitCallStatus(activeRoomId, {
    includeRoomState: true
  });

  if (status?.topicId && activeTopicId && status.topicId !== activeTopicId) {
    recordCallTelemetryEvent(
      'call.network_recovery.topic_mismatch',
      {
        reason,
        statusTopicId: status.topicId
      },
      'warn'
    );
    return false;
  }

  if (status && status.active !== true) {
    clearUnavailableCallState(activeRoomId, activeTopicId);
    markCallIssueSignal('call.network_recovery.ended', 'hard', {
      reason
    });
    showEndedCallNoticeAndReleaseMedia(user.value);
    recordCallTelemetryEvent(
      'call.network_recovery.ended',
      {
        reason,
        ...buildCallHealthTelemetryPayload()
      },
      'warn'
    );
    return true;
  }

  if (
    status?.startTime !== undefined ||
    status?.elapsedDurationMs !== undefined
  ) {
    setCallStartedAt(
      resolveCallStartTime(status.startTime, callStartedAt.value),
      status.elapsedDurationMs ?? callElapsedMs.value
    );
  }

  if (isIncoming.value && !room) {
    recordCallTelemetryEvent('call.network_recovery.incoming_preserved', {
      reason
    });
    return true;
  }

  const shouldPreserveOutgoingDialing = isOutgoingDialingCall(status);

  clearExplicitHangupState();
  open.value = true;

  if (!shouldPreserveOutgoingDialing) {
    // Network recovery must not reopen a call the user has minimized.
    ensureCallTimerContinues();
  }

  await recoverActiveCallMediaState(room);

  if (
    isPassiveCallRecoveryReason(reason) &&
    room?.state === ConnectionState.Connected
  ) {
    recordCallTelemetryEvent('call.network_recovery.skipped_connected_room', {
      ...buildCallRecoveryTelemetryPayload(reason, room),
      remoteParticipantCount: room.remoteParticipants.size
    });

    return true;
  }

  const shouldReconnectRoom = shouldReconnectLiveKitRoom(room);

  if (shouldReconnectRoom) {
    if (!shouldPreserveOutgoingDialing) {
      showReconnectCallStatusNotice();
    }

    try {
      await connectToRoom();
    } catch (error) {
      if (!shouldPreserveOutgoingDialing) {
        showReconnectCallStatusNotice();
      }

      if (activeTopicId && !shouldPreserveOutgoingDialing) {
        startDirectCallRecovery(activeRoomId, activeTopicId, {
          waitForRemote: true,
          reason: 'network-recovery-connect-failed'
        });
      }
      markCallIssueSignal('call.network_recovery.connect_failed', 'hard', {
        reason
      });
      recordCallTelemetryEvent(
        'call.network_recovery.connect_failed',
        buildCallRecoveryTelemetryPayload(reason, room, {
          ...buildCallHealthTelemetryPayload(room),
          ...getTelemetryErrorPayload(error)
        }),
        'warn'
      );
      return false;
    }
  } else {
    recordCallTelemetryEvent(
      'call.network_recovery.room_preserved',
      buildCallRecoveryTelemetryPayload(reason, room)
    );
  }

  await recoverActiveCallMediaState(room);

  if (
    room?.state === ConnectionState.Connected &&
    callStatusNoticeKind.value === 'reconnecting'
  ) {
    clearCallStatusNotice();
  }

  if (
    room &&
    !room.remoteParticipants.size &&
    !isGroupCallSession(activeTopicId) &&
    activeTopicId &&
    !shouldPreserveOutgoingDialing
  ) {
    startDirectCallRecovery(activeRoomId, activeTopicId, {
      waitForRemote: true,
      reason: 'network-recovery-no-remote'
    });
  }

  recordCallTelemetryEvent('call.network_recovery.completed', {
    ...buildCallRecoveryTelemetryPayload(reason, room),
    ...buildCallHealthTelemetryPayload(room),
    remoteParticipantCount: room?.remoteParticipants.size ?? 0
  });

  if (room?.remoteParticipants.size) {
    clearCallIssueSignal('soft');
  }

  return true;
};

export const recoverActiveCallAfterNetworkChange = async (
  reason?: string
): Promise<boolean> => {
  if (activeCallNetworkRecoveryPromise) {
    return activeCallNetworkRecoveryPromise;
  }

  activeCallNetworkRecoveryPromise =
    recoverActiveCallAfterNetworkChangeInternal(reason).finally(() => {
      activeCallNetworkRecoveryPromise = null;
    });

  return activeCallNetworkRecoveryPromise;
};

const resetMediaState = () => {
  suppressParticipantPresenceNotifications = true;
  clearLocalVideoQualityRecovery();
  localVideoPublishingQuality = VideoQuality.HIGH;
  clearTrackStreamCaches();
  currentCameraFacingMode = 'user';
  localBackgroundProcessor = null;
  localBackgroundProcessorTrack = null;
  localBackgroundProcessorSignature = null;
  hasShownBackgroundProcessorSupportError = false;
  requestedVideoActive = false;
  videoToggleOperation = null;
  clearLocalScreenShareRecoveryState();
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
  const resolvedStartTime = resolveCallStartTime(
    ack?.startTime,
    fallback?.startTime
  );
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

  if (resolvedRoomId && ack?.accepted !== false) {
    persistActiveCallSession(resolvedRoomId, resolvedTopicId);
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
  resetCallTelemetryState();
  ensureCallTelemetryTraceId();
  recordCallTelemetryEvent('call.start.requested', {
    direction: 'outgoing',
    targetUserId: targetUser.id,
    topicId: currentTopicId
  });
  setCallStartedAt(null, 0);
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
    recordCallTelemetryEvent(
      'call.start.rejected',
      {
        direction: 'outgoing'
      },
      'warn'
    );
    return;
  }

  recordCallTelemetryEvent('call.start.accepted', {
    direction: 'outgoing',
    acceptedRoomId: startAck?.roomId
  });

  await connectToRoom();
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
  resetCallTelemetryState();
  ensureCallTelemetryTraceId();
  recordCallTelemetryEvent('call.start.requested', {
    direction: 'outgoing',
    groupMode: true,
    topicId: currentTopicId
  });
  setCallStartedAt(null, 0);
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
    recordCallTelemetryEvent(
      'call.start.rejected',
      {
        direction: 'outgoing',
        groupMode: true
      },
      'warn'
    );
    return;
  }

  recordCallTelemetryEvent('call.start.accepted', {
    direction: 'outgoing',
    groupMode: true,
    acceptedRoomId: startAck?.roomId
  });

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
  resetCallTelemetryState();
  ensureCallTelemetryTraceId();
  recordCallTelemetryEvent('call.start.requested', {
    direction: 'outgoing',
    standalone: true
  });
  setCallStartedAt(null, 0);
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
    recordCallTelemetryEvent(
      'call.start.rejected',
      {
        direction: 'outgoing',
        standalone: true
      },
      'warn'
    );
    return;
  }

  recordCallTelemetryEvent('call.start.accepted', {
    direction: 'outgoing',
    standalone: true,
    acceptedRoomId: startAck?.roomId
  });

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

  const resolvedStartTime = incomingStartTime ?? callStatus.startTime ?? null;
  const resolvedElapsedDurationMs = callStatus.elapsedDurationMs ?? 0;

  resetCallTelemetryState();
  activeCallTraceId = createTelemetryTraceId('call');
  recordTelemetryEvent({
    category: 'call',
    name: 'call.incoming.received',
    traceId: activeCallTraceId,
    entityType: 'call',
    entityId: incomingRoomId,
    payload: {
      roomId: incomingRoomId,
      topicId: incomingTopicId,
      topicType: resolvedTopicType,
      groupMode: callStatus.groupMode,
      participantCount: callStatus.participantCount,
      startTime: resolvedStartTime,
      elapsedDurationMs: resolvedElapsedDurationMs
    }
  });

  if (isIncomingCallDismissed(incomingRoomId, incomingTopicId)) {
    return false;
  }

  if (resolvedTopicType !== TopicType.Group && callStatus.wasAnswered) {
    markIncomingCallDismissed(incomingRoomId, incomingTopicId);
    return false;
  }

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
  recordCallTelemetryEvent('call.answer.start', {
    direction: 'incoming'
  });
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
    recordCallTelemetryEvent('call.answer.connected', {
      direction: 'incoming'
    });
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
    resolveCallStartTime(callStatus.startTime, pendingGroupCall.startTime),
    callStatus.elapsedDurationMs ?? pendingGroupCall.elapsedDurationMs ?? 0
  );
  await applyDefaultAudioOutputRoute();
  open.value = true;
  isIncoming.value = false;
  isCalling.value = true;
  isModalVisible.value = true;

  isAcceptingLocally = true;
  localAcceptRoomId = pendingRoomId;
  localAcceptTopicId = pendingTopicId;
  resetCallTelemetryState();
  ensureCallTelemetryTraceId();
  recordCallTelemetryEvent('call.join.start', {
    groupMode: true,
    pendingRoomId,
    pendingTopicId
  });
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
    startTime: resolveCallStartTime(
      callStatus.startTime,
      pendingGroupCall.startTime
    ),
    elapsedDurationMs:
      callStatus.elapsedDurationMs ?? pendingGroupCall.elapsedDurationMs ?? 0,
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
    recordCallTelemetryEvent('call.join.connected', {
      groupMode: true
    });
    return true;
  } finally {
    isAcceptingLocally = false;
  }
};

export const hydrateInvitedGroupCallFromUrl = async (options?: {
  preview?: GroupCallInvitePreview;
}): Promise<boolean> => {
  const sdk = getChatSDK();
  const inviteParams = getInviteParamsFromUrl();

  if (!sdk || !inviteParams) return false;

  const preview =
    options?.preview?.roomId === inviteParams.roomId
      ? options.preview
      : await sdk.getGroupCallInvitePreview(
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
  value: string,
  options?: {
    allowTrustedOrigin?: boolean;
    preview?: GroupCallInvitePreview;
  }
): Promise<boolean> => {
  if (typeof window === 'undefined') {
    return false;
  }

  const invite = parseGroupCallInviteUrl(value, {
    allowTrustedOrigin:
      options?.allowTrustedOrigin ?? Capacitor.isNativePlatform()
  });

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
  return hydrateInvitedGroupCallFromUrl(options);
};

const joinInvitedGroupCallInternal = async (
  invite: InvitedGroupCallEntry
): Promise<boolean | void> => {
  const sdk = getChatSDK();
  const me = getAuthUser();

  if (!sdk || !me || open.value) return false;
  clearExplicitHangupState();
  clearCallStatusNotice();

  const callStatus = await getLiveKitCallStatus(invite.roomId, invite.topicId);
  if (!callStatus?.active) {
    clearUnavailableCallState(invite.roomId, invite.topicId);
    clearInviteParamsFromUrl();
    showTransientCallStatusNotice('Звонок уже завершён');
    return false;
  }

  await prepareInvitedGroupCallJoinState(invite, callStatus, me);
  resetCallTelemetryState();
  ensureCallTelemetryTraceId();
  recordCallTelemetryEvent('call.join.start', {
    invited: true,
    groupMode: true,
    inviteRoomId: invite.roomId,
    inviteTopicId: invite.topicId
  });
  const answerAck = await sdk.sendWebSocketEventWithAck<
    WebSocketEventType.ANSWER_CALL,
    CallSocketAck
  >(WebSocketEventType.ANSWER_CALL, {
    roomId: invite.roomId,
    topicId: invite.topicId,
    userId: me.id,
    inviteToken: invite.inviteToken
  });
  applyCallSocketAck(answerAck, {
    roomId: invite.roomId,
    topicId: invite.topicId,
    startTime: resolveCallStartTime(callStatus.startTime, invite.startTime),
    elapsedDurationMs:
      callStatus.elapsedDurationMs ?? invite.elapsedDurationMs ?? 0,
    isNewCall: false
  });
  if (answerAck?.accepted === false) {
    isAcceptingLocally = false;
    showTransientCallStatusNotice('Звонок уже завершён');
    return;
  }
  clearInviteParamsFromUrl();
  localAcceptRoomId = roomId.value;
  localAcceptTopicId = topicId.value;

  try {
    const didConnect = await connectInvitedGroupCallWithRetry(
      invite,
      me,
      callStatus
    );
    if (!didConnect) {
      return false;
    }
    recordCallTelemetryEvent('call.join.connected', {
      invited: true,
      groupMode: true
    });
    return true;
  } finally {
    isAcceptingLocally = false;
  }
};

export const joinInvitedGroupCall = async (): Promise<boolean | void> => {
  const invite = invitedGroupCall.value;

  if (!invite) return false;

  if (
    invitedGroupCallJoinPromise &&
    invitedGroupCallJoinRoomId === invite.roomId
  ) {
    recordCallTelemetryEvent('call.join.invite_join_in_flight', {
      invited: true,
      groupMode: true,
      inviteRoomId: invite.roomId,
      inviteTopicId: invite.topicId
    });
    return invitedGroupCallJoinPromise;
  }

  const joinPromise = joinInvitedGroupCallInternal(invite);
  invitedGroupCallJoinPromise = joinPromise;
  invitedGroupCallJoinRoomId = invite.roomId;

  try {
    return await joinPromise;
  } finally {
    if (invitedGroupCallJoinPromise === joinPromise) {
      invitedGroupCallJoinPromise = null;
      invitedGroupCallJoinRoomId = null;
    }
  }
};

export const handleCallAnswered = async (
  answeredUserId: string,
  answeredRoomId?: string,
  answeredTopicId?: string | null,
  answeredStartTime?: number | null,
  answeredElapsedDurationMs?: number
) => {
  const me = getAuthUser();
  const isLocalInvitedGroupAnswer =
    answeredUserId === me?.id &&
    !!answeredRoomId &&
    invitedGroupCall.value?.roomId === answeredRoomId;

  if (!isLocalInvitedGroupAnswer) {
    markIncomingCallDismissed(answeredRoomId, answeredTopicId);
  }

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
          startTime: resolveCallStartTime(
            answeredStartTime,
            existingPendingCall?.startTime,
            answeredTopic?.activeCall?.startTime
          ),
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
              startTime: resolveCallStartTime(
                answeredStartTime,
                topic.activeCall?.startTime
              ),
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
      resolveCallStartTime(answeredStartTime, callStartedAt.value),
      answeredElapsedDurationMs ?? callElapsedMs.value
    );
  }

  if (matchesLocalAccept) {
    open.value = true;
  }

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
  clearPersistedActiveCallSession(roomId.value);
  recordCallTelemetryEvent('call.ended.notice', {
    message,
    ...buildCallHealthTelemetryPayload()
  });
  connectAttemptId += 1;
  connectPromise = null;
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
  releaseNativeCallAudio();

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
  recordCallTelemetryEvent('call.ended.received', {
    endedRoomId,
    endedTopicId,
    reason,
    endedByUserId,
    ...buildCallHealthTelemetryPayload()
  });

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
    showTransientCallStatusNotice(
      'Пользователь занят',
      CALL_STATUS_NOTICE_CLOSE_DELAY_MS,
      'busy'
    );
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
        waitForRemote: true,
        reason: 'call-ended-without-user'
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
  const preservesActiveInviteAuthorization =
    !!targetRoomId &&
    invitedGroupCall.value?.roomId === targetRoomId &&
    (roomId.value === targetRoomId || isAcceptingLocally || isCalling.value);

  if (!preservesActiveInviteAuthorization) {
    markIncomingCallDismissed(targetRoomId, targetTopicId);
  }
  removePendingGroupCallEntry(targetTopicId);
  if (!preservesActiveInviteAuthorization) {
    removeInvitedGroupCallEntry(targetRoomId);
  }

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
      startTime: resolveCallStartTime(status?.startTime, call.startTime),
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

  const persistedSession = readPersistedActiveCallSession();
  if (
    !persistedSession ||
    open.value ||
    isModalVisible.value ||
    roomId.value ||
    isExplicitHangupInProgress
  ) {
    return;
  }

  let persistedCall = resolvedCalls.find(
    ({ call }) => call.roomId === persistedSession.roomId
  );
  if (!persistedCall) {
    const status = await getRawLiveKitCallStatus(persistedSession.roomId);

    if (!status) {
      return;
    }

    if (status.active !== true) {
      clearPersistedActiveCallSession(persistedSession.roomId);
      return;
    }

    persistedCall = {
      call: {
        roomId: persistedSession.roomId,
        topicId: persistedSession.topicId ?? status.topicId ?? null,
        callType: 'livekit',
        startTime: status.startTime ?? persistedSession.startTime ?? null,
        participantCount: status.participantCount,
        groupMode: status.groupMode,
        elapsedDurationMs:
          status.elapsedDurationMs ?? persistedSession.elapsedDurationMs ?? 0
      },
      status
    };
  }

  if (persistedCall.status === null) {
    clearPersistedActiveCallSession(persistedSession.roomId);
    return;
  }

  const restoredTopicId =
    persistedSession.topicId ??
    persistedCall.status?.topicId ??
    persistedCall.call.topicId ??
    null;
  const restoredTopic = restoredTopicId
    ? (topicsApi.getSelectedTopic(restoredTopicId) as any)
    : null;
  const restoredTimerSnapshot = resolveRestoredCallTimerSnapshot(
    {
      startTime: resolveCallStartTime(
        persistedCall.status?.startTime,
        persistedCall.call.startTime
      ),
      elapsedDurationMs:
        persistedCall.status?.elapsedDurationMs ??
        persistedCall.call.elapsedDurationMs ??
        0
    },
    persistedSession
  );

  roomId.value = persistedSession.roomId;
  topicId.value = restoredTopicId;
  user.value = restoredTopic?.user || getAuthUser() || null;
  setCallStartedAt(
    restoredTimerSnapshot.startTime,
    restoredTimerSnapshot.elapsedDurationMs
  );
  isIncoming.value = persistedSession.isIncoming;
  isCalling.value =
    persistedSession.isCalling && persistedCall.status?.wasAnswered !== true;
  open.value = true;
  isModalVisible.value = true;
  clearExplicitHangupState();
  showReconnectCallStatusNotice();
  startDirectCallRecovery(persistedSession.roomId, restoredTopicId, {
    waitForRemote: true,
    reason: 'persisted-session-restore'
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

const isHealthyLocalScreenSharePublication = (
  publication: ReturnType<typeof getLocalScreenSharePublication>
): boolean =>
  Boolean(
    publication &&
      !publication.isMuted &&
      publication.track instanceof LocalVideoTrack &&
      publication.track.mediaStreamTrack.readyState === 'live'
  );

const clearRecoveredLocalScreenShareStatus = (activeRoom: Room): void => {
  if (
    lastCallIssueSignal?.name !== 'call.screen_share.recovery_started' ||
    activeRoom.state !== ConnectionState.Connected ||
    isLocalNetworkOffline ||
    directCallRecoveryRoomId
  ) {
    return;
  }

  if (callStatusNoticeKind.value === 'reconnecting') {
    clearCallStatusNotice();
  }
  clearCallIssueSignal('soft');
};

const clearScreenShareRecoveryTimer = () => {
  if (!screenShareRecoveryTimeout) {
    return;
  }

  clearTimeout(screenShareRecoveryTimeout);
  screenShareRecoveryTimeout = null;
};

const rememberLocalScreenShareTrack = (track: unknown) => {
  if (
    track instanceof LocalVideoTrack &&
    track.mediaStreamTrack.readyState === 'live'
  ) {
    localScreenShareTrackForRecovery = track;
  }
};

const getRecoverableLocalScreenShareTrack = (): LocalVideoTrack | null => {
  if (
    localScreenShareTrackForRecovery?.mediaStreamTrack.readyState === 'live'
  ) {
    return localScreenShareTrackForRecovery;
  }

  localScreenShareTrackForRecovery = null;
  return null;
};

const clearLocalScreenShareRecoveryState = () => {
  screenShareRecoveryAttemptId += 1;
  clearScreenShareRecoveryTimer();
  shouldRecoverLocalScreenShare = false;
  localScreenShareTrackForRecovery = null;
  screenShareRecoveryAttemptCount = 0;
};

const hasActiveRemoteScreenShare = (activeRoom: Room): boolean =>
  Array.from(activeRoom.remoteParticipants.values()).some(participant =>
    Array.from(participant.videoTrackPublications.values()).some(
      publication =>
        publication.source === Track.Source.ScreenShare &&
        !publication.isMuted &&
        publication.track?.mediaStreamTrack?.readyState !== 'ended'
    )
  );

const scheduleLocalScreenShareRecovery = (
  reason: string,
  delayMs = SCREEN_SHARE_RECOVERY_RETRY_DELAY_MS
) => {
  clearScreenShareRecoveryTimer();

  if (
    !shouldRecoverLocalScreenShare ||
    isStoppingScreenShare ||
    isStoppingAndroidScreenShare ||
    isExplicitHangupInProgress ||
    !getRecoverableLocalScreenShareTrack()
  ) {
    return;
  }

  const attemptId = screenShareRecoveryAttemptId;
  screenShareRecoveryTimeout = setTimeout(() => {
    screenShareRecoveryTimeout = null;
    if (attemptId !== screenShareRecoveryAttemptId) {
      return;
    }

    void recoverLocalScreenSharePublication(room, reason);
  }, delayMs);
};

const recoverLocalScreenSharePublication = (
  activeRoom: Room | null = room,
  reason = 'screen-share-recovery'
): Promise<boolean> => {
  if (screenShareRecoveryPromise) {
    return screenShareRecoveryPromise;
  }

  const recoveryAttemptId = screenShareRecoveryAttemptId;
  const recoveryPromise = (async (): Promise<boolean> => {
    if (
      !activeRoom ||
      activeRoom !== room ||
      !shouldRecoverLocalScreenShare ||
      isStoppingScreenShare ||
      isStoppingAndroidScreenShare ||
      isExplicitHangupInProgress
    ) {
      return false;
    }

    const existingPublication = getLocalScreenSharePublication(activeRoom);
    rememberLocalScreenShareTrack(existingPublication?.track);

    if (isHealthyLocalScreenSharePublication(existingPublication)) {
      clearScreenShareRecoveryTimer();
      screenShareRecoveryAttemptCount = 0;
      syncLocalTrackState();
      clearRecoveredLocalScreenShareStatus(activeRoom);
      return true;
    }

    const recoverableTrack = getRecoverableLocalScreenShareTrack();

    if (!recoverableTrack) {
      recordCallTelemetryEvent(
        'call.screen_share.recovery_unavailable',
        {
          reason,
          liveKitState: activeRoom.state,
          hasPublication: Boolean(existingPublication),
          mediaTrackReadyState:
            existingPublication?.track?.mediaStreamTrack?.readyState ?? null
        },
        'warn'
      );
      clearLocalScreenShareRecoveryState();
      syncLocalTrackState();
      return false;
    }

    if (hasActiveRemoteScreenShare(activeRoom)) {
      recordCallTelemetryEvent('call.screen_share.recovery_paused', {
        reason: 'remote-share-active',
        trigger: reason,
        liveKitState: activeRoom.state
      });
      return false;
    }

    if (activeRoom.state !== ConnectionState.Connected) {
      scheduleLocalScreenShareRecovery(reason);
      return false;
    }

    screenShareRecoveryAttemptCount += 1;
    const attemptNumber = screenShareRecoveryAttemptCount;
    markCallIssueSignal('call.screen_share.recovery_started', 'soft', {
      reason
    });
    showReconnectCallStatusNotice();
    recordCallTelemetryEvent(
      'call.screen_share.recovery_started',
      {
        reason,
        attemptNumber,
        trackSid: existingPublication?.trackSid ?? null,
        mediaTrackId: recoverableTrack.mediaStreamTrack.id,
        mediaTrackReadyState: recoverableTrack.mediaStreamTrack.readyState,
        liveKitState: activeRoom.state
      },
      'warn'
    );

    try {
      if (existingPublication) {
        if (existingPublication.isMuted) {
          await existingPublication.unmute();
        }
      } else {
        await activeRoom.localParticipant.publishTrack(recoverableTrack, {
          ...SCREEN_SHARE_PUBLISH_DEFAULTS,
          source: Track.Source.ScreenShare,
          name: Track.Source.ScreenShare,
          stream: Track.Source.ScreenShare
        });
      }

      if (
        recoveryAttemptId !== screenShareRecoveryAttemptId ||
        activeRoom !== room
      ) {
        return false;
      }

      await ensureLocalMicrophoneState(activeRoom);
      syncLocalTrackState();
      const recoveredPublication = getLocalScreenSharePublication(activeRoom);
      const isRecovered = Boolean(
        isHealthyLocalScreenSharePublication(recoveredPublication) &&
          state.isScreenSharingActive
      );

      if (!isRecovered) {
        throw new Error('Screen share publication was not restored');
      }

      clearScreenShareRecoveryTimer();
      recordCallTelemetryEvent('call.screen_share.recovery_completed', {
        reason,
        attemptNumber,
        trackSid: recoveredPublication?.trackSid ?? null,
        mediaTrackId: recoverableTrack.mediaStreamTrack.id,
        liveKitState: activeRoom.state
      });

      clearRecoveredLocalScreenShareStatus(activeRoom);

      screenShareRecoveryAttemptCount = 0;
      return true;
    } catch (error) {
      recordCallTelemetryEvent(
        'call.screen_share.recovery_failed',
        {
          reason,
          attemptNumber,
          mediaTrackId: recoverableTrack.mediaStreamTrack.id,
          mediaTrackReadyState: recoverableTrack.mediaStreamTrack.readyState,
          liveKitState: activeRoom.state,
          ...getTelemetryErrorPayload(error)
        },
        'warn'
      );

      if (
        recoveryAttemptId === screenShareRecoveryAttemptId &&
        shouldRecoverLocalScreenShare &&
        recoverableTrack.mediaStreamTrack.readyState === 'live'
      ) {
        scheduleLocalScreenShareRecovery(reason);
      }

      return false;
    }
  })();

  screenShareRecoveryPromise = recoveryPromise;
  void recoveryPromise.finally(() => {
    if (screenShareRecoveryPromise === recoveryPromise) {
      screenShareRecoveryPromise = null;
    }
  });

  return recoveryPromise;
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

export const toggleScreenShare = async (
  reason: 'user-toggle' | 'browser-track-ended' = 'user-toggle'
) => {
  if (!room) return;

  const isScreenShareRequested =
    state.isScreenSharingActive || shouldRecoverLocalScreenShare;

  if (!isScreenShareRequested) {
    const remoteScreenShareParticipant = remoteParticipants.value.find(
      participant => participant.isScreenShareActive
    );

    if (remoteScreenShareParticipant) {
      recordCallTelemetryEvent(
        'call.screen_share.start_blocked',
        {
          reason: 'remote-share-active',
          trigger: reason,
          remoteParticipantId: remoteScreenShareParticipant.identity
        },
        'warn'
      );
      return;
    }
  }

  const nextScreenShareState = !isScreenShareRequested;
  const activeRoom = room;

  if (nextScreenShareState) {
    shouldRecoverLocalScreenShare = true;
  } else {
    isStoppingScreenShare = true;
    clearLocalScreenShareRecoveryState();
  }

  recordCallTelemetryEvent('call.screen_share.toggle_requested', {
    reason,
    targetEnabled: nextScreenShareState,
    liveKitState: activeRoom.state,
    documentVisibility:
      typeof document !== 'undefined' ? document.visibilityState : null,
    documentHasFocus:
      typeof document !== 'undefined' ? document.hasFocus() : null
  });

  try {
    if (isAndroidScreenSharePlatform()) {
      if (nextScreenShareState) {
        await publishAndroidScreenShare(activeRoom);
      } else {
        isStoppingAndroidScreenShare = true;
        await unpublishAndroidScreenShare(activeRoom);
      }
    } else {
      await activeRoom.localParticipant.setScreenShareEnabled(
        nextScreenShareState,
        SCREEN_SHARE_CAPTURE_DEFAULTS,
        SCREEN_SHARE_PUBLISH_DEFAULTS
      );
      await ensureLocalMicrophoneState(activeRoom);
    }

    recordCallTelemetryEvent('call.screen_share.toggle_completed', {
      reason,
      targetEnabled: nextScreenShareState,
      liveKitState: activeRoom.state
    });

    if (nextScreenShareState) {
      const publication = getLocalScreenSharePublication(activeRoom);
      rememberLocalScreenShareTrack(publication?.track);
      shouldRecoverLocalScreenShare = Boolean(publication?.track);
    } else {
      localScreenShareTrackForRecovery = null;
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

    recordCallTelemetryEvent(
      'call.screen_share.toggle_failed',
      {
        reason,
        targetEnabled: nextScreenShareState,
        canceledByUser: isCanceledByUser,
        unsupportedDevice: isUnsupportedDevice,
        liveKitState: activeRoom.state,
        ...getTelemetryErrorPayload(error)
      },
      isCanceledByUser ? 'info' : 'error'
    );

    if (nextScreenShareState) {
      clearLocalScreenShareRecoveryState();
    }

    console.warn('[LiveKit] Failed to toggle screen share:', error);
  } finally {
    isStoppingScreenShare = false;
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
  clearPersistedActiveCallSession(activeRoomId);
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
      invitedGroupCall.value?.roomId === activeRoomId ||
      Boolean(getCallInviteToken(activeRoomId)));
  const shouldCloseImmediatelyAfterHangup =
    isGroupCallSessionActive && !hasOtherParticipantsInGroupCall;
  const shouldShowEndedNotice =
    open.value &&
    isModalVisible.value &&
    !isIncoming.value &&
    !shouldCloseImmediatelyAfterHangup;
  const leaveTelemetryPayload = buildCallLeaveTelemetryPayload({
    activeRoomId,
    activeTopicId,
    wasIncomingCall,
    isGroupCallSessionActive,
    hasOtherParticipantsInGroupCall
  });

  recordCallTelemetryEvent('call.leave.intent', leaveTelemetryPayload, 'warn');
  recordCallTelemetryEvent('call.leave.requested', leaveTelemetryPayload);

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
  void emitEndCallEvent(
    activeRoomId,
    activeTopicId,
    'user_leave',
    leaveTelemetryPayload
  ).then(acknowledged => {
    if (
      acknowledged &&
      pendingEndCallRoomId.value === activeRoomId &&
      pendingEndCallTopicId.value === activeTopicId
    ) {
      pendingEndCallAcknowledged = true;
    }
  });

  if (invitedGroupCall.value?.roomId === activeRoomId) {
    invitedGroupCall.value = null;
  }

  if (shouldShowEndedNotice || wasIncomingCall) {
    showEndedCallNoticeAndReleaseMedia(activeCaller);
    return;
  }

  connectAttemptId += 1;
  connectPromise = null;
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
  releaseNativeCallAudio();

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

  resetCallTelemetryState();
};

export const cleanup = (disconnectRoom = true) => {
  clearPersistedActiveCallSession(roomId.value);
  recordCallTelemetryEvent('call.cleanup', {
    disconnectRoom,
    ...buildCallHealthTelemetryPayload()
  });
  connectAttemptId += 1;
  connectPromise = null;
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
  releaseNativeCallAudio();

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

  resetCallTelemetryState();
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

const hasActiveCallForNetworkStatus = () =>
  !!roomId.value &&
  (open.value || isModalVisible.value || isCalling.value || !!room);

const hasActiveCallForPageUnload = () =>
  !Capacitor.isNativePlatform() &&
  !isExplicitHangupInProgress &&
  !!roomId.value &&
  (open.value || isModalVisible.value || isCalling.value || !!room);

const sendWebClientClosingIntent = (
  source: 'beforeunload' | 'pagehide',
  options: { persistSession: boolean; allowExplicitHangup?: boolean }
): boolean => {
  if (
    Capacitor.isNativePlatform() ||
    (!options.allowExplicitHangup && isExplicitHangupInProgress) ||
    !roomId.value
  ) {
    return false;
  }

  if (options.persistSession) {
    persistActiveCallSession(roomId.value, topicId.value);
  }

  const sdk = getChatSDK();
  const me = getAuthUser();
  if (!sdk || !me) {
    recordCallTelemetryEvent(
      'call.client_closing.send_skipped',
      {
        source,
        hasSdk: Boolean(sdk),
        hasUser: Boolean(me)
      },
      'warn'
    );
    return false;
  }

  const targetRoomId = roomId.value;
  const targetTopicId = topicId.value;
  const socketSent = sdk.isConnected()
    ? sdk.sendWebSocketEvent(WebSocketEventType.CALL_CLIENT_CLOSING, {
        userId: me.id,
        roomId: targetRoomId,
        topicId: targetTopicId,
        source
      })
    : false;
  const apiUrl = sdk.getConfig()?.CHAT_API_DOMAIN?.replace(/\/$/, '');
  const authToken = getAuthToken();
  const keepaliveRequested = Boolean(apiUrl && authToken);

  if (keepaliveRequested) {
    void fetch(`${apiUrl}/calls/client-closing`, {
      method: 'POST',
      keepalive: true,
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        roomId: targetRoomId,
        topicId: targetTopicId,
        source
      })
    }).catch(error => {
      console.warn('[LiveKit] Failed to send client closing intent:', error);
    });
  }

  const sent = socketSent || keepaliveRequested;

  recordCallTelemetryEvent(
    sent
      ? 'call.client_closing.intent_sent'
      : 'call.client_closing.send_failed',
    {
      source,
      targetRoomId,
      targetTopicId,
      socketSent,
      keepaliveRequested
    },
    sent ? 'warn' : 'error'
  );

  return sent;
};

const notifyWebClientClosing = (source: 'beforeunload' | 'pagehide') => {
  sendWebClientClosingIntent(source, { persistSession: true });
};

const sendActiveCallPageUnloadHangup = (
  source: 'beforeunload' | 'pagehide'
) => {
  if (!hasActiveCallForPageUnload()) {
    return;
  }

  const targetRoomId = roomId.value;
  const targetTopicId = topicId.value;

  if (!targetRoomId || pageUnloadHangupRoomId === targetRoomId) {
    return;
  }

  pageUnloadHangupRoomId = targetRoomId;
  isExplicitHangupInProgress = true;
  clearPersistedActiveCallSession(targetRoomId);

  const sdk = getChatSDK();
  const me = getAuthUser();
  const socketSent =
    !!sdk &&
    !!me &&
    sdk.isConnected() &&
    sdk.sendWebSocketEvent(WebSocketEventType.END_CALL, {
      roomId: targetRoomId,
      topicId: targetTopicId,
      userId: me.id
    });

  const clientClosingFallbackSent = sendWebClientClosingIntent(source, {
    persistSession: false,
    allowExplicitHangup: true
  });

  recordCallTelemetryEvent(
    socketSent ? 'call.unload_hangup.sent' : 'call.unload_hangup.send_failed',
    {
      source,
      targetRoomId,
      targetTopicId,
      socketSent,
      clientClosingFallbackSent,
      hasSdk: Boolean(sdk),
      hasUser: Boolean(me)
    },
    socketSent ? 'warn' : 'error'
  );
};

const handleLiveKitBeforeUnload = (event: BeforeUnloadEvent) => {
  if (!hasActiveCallForPageUnload()) {
    return;
  }

  if (isLiveKitPageReloadIntentActive()) {
    notifyWebClientClosing('beforeunload');
    return;
  }

  event.preventDefault();
  event.returnValue = ACTIVE_CALL_CLOSE_WARNING;
  return ACTIVE_CALL_CLOSE_WARNING;
};

const handleLiveKitPageHide = (event: PageTransitionEvent) => {
  if (event.persisted || !hasActiveCallForPageUnload()) {
    return;
  }

  if (isLiveKitPageReloadIntentActive()) {
    notifyWebClientClosing('pagehide');
    return;
  }

  sendActiveCallPageUnloadHangup('pagehide');
};

const handleLiveKitReloadKeydown = (event: KeyboardEvent) => {
  const key = event.key.toLowerCase();
  const code = event.code.toLowerCase();
  const isReloadShortcut =
    event.key === 'F5' ||
    event.code === 'F5' ||
    key === 'browserrefresh' ||
    code === 'browserrefresh' ||
    ((event.ctrlKey || event.metaKey) &&
      (key === 'r' || event.code === 'KeyR'));

  if (isReloadShortcut) {
    markLiveKitPageReloadIntent();
  }
};

const handleLocalNetworkOffline = (
  reason: 'browser-offline' | 'native-network-offline',
  diagnostics: Record<string, unknown> = {}
) => {
  if (
    isLocalNetworkOffline ||
    isExplicitHangupInProgress ||
    !hasActiveCallForNetworkStatus()
  ) {
    return;
  }

  isLocalNetworkOffline = true;
  state.connectionQuality = ConnectionQuality.Lost;
  markCallIssueSignal('call.network.offline', 'soft', { reason });
  showReconnectCallStatusNotice();

  if (room) {
    setLocalVideoPublishingQuality(room, VideoQuality.LOW, reason);
  }

  recordCallTelemetryEvent(
    'call.network.offline',
    {
      reason,
      ...diagnostics,
      ...buildCallHealthTelemetryPayload(room)
    },
    'warn'
  );
};

const handleLocalNetworkOnline = (
  reason: 'browser-online' | 'native-network-online',
  diagnostics: Record<string, unknown> = {}
) => {
  if (!isLocalNetworkOffline) {
    return;
  }

  isLocalNetworkOffline = false;
  recordCallTelemetryEvent('call.network.online', {
    reason,
    ...diagnostics,
    ...buildCallHealthTelemetryPayload(room)
  });
  void recoverActiveCallAfterNetworkChange(reason);
};

const handleNativeNetworkStatus = (status: NativeNetworkStatus) => {
  const hasValidatedNetwork =
    status.networkConnected && status.networkValidated !== false;

  if (hasValidatedNetwork) {
    handleLocalNetworkOnline('native-network-online', status);
    return;
  }

  handleLocalNetworkOffline('native-network-offline', status);
};

const setupNativeNetworkStatusListener = async () => {
  if (nativeNetworkStatusListener) {
    return;
  }

  try {
    nativeNetworkStatusListener = await addNativeNetworkStatusListener(
      handleNativeNetworkStatus
    );
    const initialStatus = await getNativeNetworkStatus();
    if (initialStatus) {
      handleNativeNetworkStatus(initialStatus);
    }
  } catch (error) {
    console.warn('[LiveKit] Failed to listen native network status:', error);
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', handleLiveKitReloadKeydown, true);

  window.addEventListener('beforeunload', handleLiveKitBeforeUnload);

  window.addEventListener('pagehide', handleLiveKitPageHide);

  window.addEventListener('offline', () => {
    handleLocalNetworkOffline('browser-offline');
  });

  window.addEventListener('online', () => {
    if (Capacitor.isNativePlatform()) {
      void getNativeNetworkStatus()
        .then(status => {
          if (status) {
            handleNativeNetworkStatus(status);
          }
        })
        .catch(error => {
          console.warn('[LiveKit] Failed to verify native network:', error);
        });
      return;
    }

    handleLocalNetworkOnline('browser-online');
  });

  if (Capacitor.isNativePlatform()) {
    setupAudioOutputRouteListener();
    void setupNativeNetworkStatusListener();

    void App.addListener('appStateChange', ({ isActive }) => {
      isNativeAppInBackground = !isActive;

      if (!isActive) {
        if (callStatusNoticeKind.value === 'reconnecting') {
          clearCallStatusNotice();
        }
        return;
      }

      if (isLocalNetworkOffline || isCallReconnecting()) {
        showReconnectCallStatusNotice();
      }

      void recoverActiveCallAfterNetworkChange('native-app-resume');
    });
  }
}
