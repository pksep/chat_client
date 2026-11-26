import {
  activeGroupCalls,
  ACTIVE_CALL_SESSION_STORAGE_KEY,
  activeCallFormattedTime,
  activeCallParticipantCount,
  activeCallTopicId,
  activeCallUser,
  hasPendingGroupCall,
  invitedGroupCallInfo,
  isAnyCallDialing,
  isAnyCallIncoming,
  isAnyCallModalVisible,
  isCallActive,
  requestCallPresentation,
  pendingGroupCallInfo
} from './useCallState';

export {
  activeCallFormattedTime,
  activeCallParticipantCount,
  activeCallTopicId,
  activeCallUser,
  hasPendingGroupCall,
  invitedGroupCallInfo,
  isAnyCallDialing,
  isAnyCallIncoming,
  isAnyCallModalVisible,
  isCallActive,
  pendingGroupCallInfo
};

const loadLiveKit = () => import('./useLiveKit');
let invitedGroupCallRestorePromise: Promise<boolean> | null = null;
let invitedGroupCallRestoreKey: string | null = null;

const getInviteRestoreKey = (): string | null => {
  if (typeof window === 'undefined') return null;
  const params = new URL(window.location.href).searchParams;
  if (!params.get('callRoom') || !params.get('callInvite')) return null;
  return JSON.stringify([
    params.get('callRoom'),
    params.get('callInvite'),
    params.get('organization')
  ]);
};

export const handleIncomingCall = async (
  targetUser: any,
  activeRoomId: string,
  activeTopicId?: string | null,
  activeTopicType?: string,
  startTime?: number | null
) => {
  const { receiveIncomingCall } = await loadLiveKit();

  return receiveIncomingCall(
    targetUser,
    activeRoomId,
    activeTopicId,
    activeTopicType,
    startTime
  );
};

export const declineCall = async () => {
  const { leaveCall } = await loadLiveKit();

  leaveCall();
};

export const showCallModal = () => {
  requestCallPresentation();
};

export const joinGroupCall = async (
  topicId?: string,
  options?: { signal?: AbortSignal }
) => {
  const { joinPendingGroupCall } = await loadLiveKit();

  if (options?.signal?.aborted) return false;
  return !!(await joinPendingGroupCall(topicId, options));
};

export const joinInviteGroupCall = async (options?: {
  signal?: AbortSignal;
}) => {
  const { joinInvitedGroupCall } = await loadLiveKit();

  if (options?.signal?.aborted) return false;
  return !!(await joinInvitedGroupCall(options));
};

export const handleCallAnswered = async (
  userId: string,
  roomId?: string,
  topicId?: string | null,
  startTime?: number | null,
  elapsedDurationMs?: number
) => {
  const { handleCallAnswered: handleLiveKitAnswered } = await loadLiveKit();

  handleLiveKitAnswered(userId, roomId, topicId, startTime, elapsedDurationMs);
};

export const handleCallEnded = async (
  roomId?: string,
  topicId?: string | null,
  reason?: 'busy',
  userId?: string | null
) => {
  const { handleCallEnded: handleLiveKitEnded } = await loadLiveKit();

  return handleLiveKitEnded(roomId, topicId, reason, userId);
};

export const handleCallParticipantLeft = async (
  participantId: string,
  roomId?: string,
  topicId?: string | null
) => {
  const { handleCallParticipantLeft: handleLiveKitParticipantLeft } =
    await loadLiveKit();

  return handleLiveKitParticipantLeft(participantId, roomId, topicId);
};

export const dismissIncomingCall = async (
  roomId?: string,
  topicId?: string | null
) => {
  const { dismissIncomingCallState } = await loadLiveKit();

  dismissIncomingCallState(roomId, topicId);
};

export const cleanupAllCalls = async () => {
  const { cleanup } = await loadLiveKit();

  cleanup();
};

export const syncServerActiveCalls = async (
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
  // Пустой список не требует SDK звонков; сохранённый звонок всё ещё восстанавливаем.
  if (
    calls.length === 0 &&
    Object.keys(activeGroupCalls.value).length === 0 &&
    !isCallActive.value &&
    !isAnyCallIncoming.value &&
    !isAnyCallDialing.value &&
    !activeCallTopicId.value &&
    !hasPendingGroupCall.value &&
    !invitedGroupCallInfo.value &&
    (typeof window === 'undefined' ||
      !window.localStorage.getItem(ACTIVE_CALL_SESSION_STORAGE_KEY))
  )
    return;
  const { syncActiveCalls } = await loadLiveKit();

  return syncActiveCalls(calls, replace);
};

export const recoverActiveCallAfterNetworkChange = async (reason?: string) => {
  const hasActiveCallRuntime =
    isCallActive.value ||
    isAnyCallModalVisible.value ||
    isAnyCallDialing.value ||
    isAnyCallIncoming.value ||
    !!activeCallTopicId.value;

  if (!hasActiveCallRuntime) {
    return false;
  }

  const { recoverActiveCallAfterNetworkChange: recoverLiveKitCall } =
    await loadLiveKit();

  return recoverLiveKitCall(reason);
};

export const removeActiveGroupCall = async (topicId?: string) => {
  const { clearActiveGroupCall } = await loadLiveKit();

  clearActiveGroupCall(topicId);
};

export const removeInvitedGroupCall = async (roomId?: string) => {
  const { clearInvitedGroupCall } = await loadLiveKit();

  clearInvitedGroupCall(roomId);
};

export const restoreInvitedGroupCallFromUrl = (): Promise<boolean> => {
  const key = getInviteRestoreKey();
  if (!key) return Promise.resolve(false);
  if (invitedGroupCallRestorePromise && invitedGroupCallRestoreKey === key) {
    return invitedGroupCallRestorePromise;
  }

  const promise = loadLiveKit()
    .then(({ hydrateInvitedGroupCallFromUrl }) =>
      getInviteRestoreKey() === key ? hydrateInvitedGroupCallFromUrl() : false
    )
    .finally(() => {
      if (invitedGroupCallRestorePromise === promise) {
        invitedGroupCallRestorePromise = null;
        invitedGroupCallRestoreKey = null;
      }
    });

  invitedGroupCallRestoreKey = key;
  invitedGroupCallRestorePromise = promise;
  return promise;
};

export const copyInviteGroupCallLink = async () => {
  const { copyInvitedGroupCallLink } = await loadLiveKit();

  return copyInvitedGroupCallLink();
};

export const createMeetingInviteLink = async () => {
  const { createStandaloneMeetingInviteLink } = await loadLiveKit();

  return createStandaloneMeetingInviteLink();
};
