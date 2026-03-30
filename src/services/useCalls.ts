import { computed } from 'vue';
import {
  activeGroupCalls,
  clearActiveGroupCall,
  clearInvitedGroupCall,
  cleanup,
  copyInvitedGroupCallLink,
  formattedTime,
  handleCallAnswered as handleLiveKitAnswered,
  handleCallEnded as handleLiveKitEnded,
  hydrateInvitedGroupCallFromUrl,
  isCalling,
  isIncoming,
  isModalVisible,
  invitedGroupCall,
  joinInvitedGroupCall,
  joinPendingGroupCall,
  open,
  receiveIncomingCall,
  syncActiveCalls,
  user,
  leaveCall
} from './useLiveKit';

export const activeCallUser = computed(() => user.value as any);
export const isCallActive = computed(() => open.value);
export const hasPendingGroupCall = computed(
  () => Object.keys(activeGroupCalls.value).length > 0
);
export const pendingGroupCallInfo = computed(() => activeGroupCalls.value);
export const invitedGroupCallInfo = computed(() => invitedGroupCall.value);
export const isAnyCallModalVisible = computed(() => isModalVisible.value);
export const isAnyCallDialing = computed(() => isCalling.value);
export const isAnyCallIncoming = computed(() => isIncoming.value);
export const activeCallFormattedTime = computed(() => formattedTime.value);

export const handleIncomingCall = (
  targetUser: any,
  activeRoomId: string,
  activeTopicId: string
) => {
  receiveIncomingCall(targetUser, activeRoomId, activeTopicId);
};

export const declineCall = () => {
  leaveCall();
};

export const showCallModal = () => {
  isModalVisible.value = true;
};

export const joinGroupCall = async (topicId?: string) => {
  await joinPendingGroupCall(topicId);
};

export const joinInviteGroupCall = async () => {
  await joinInvitedGroupCall();
};

export const handleCallAnswered = (userId: string, roomId?: string) => {
  handleLiveKitAnswered(userId, roomId);
};

export const handleCallEnded = () => {
  handleLiveKitEnded();
};

export const cleanupAllCalls = () => {
  cleanup();
};

export const syncServerActiveCalls = (
  calls: Array<{ roomId: string; topicId: string; callType: string }>
) => {
  syncActiveCalls(calls);
};

export const removeActiveGroupCall = (topicId?: string) => {
  clearActiveGroupCall(topicId);
};

export const removeInvitedGroupCall = (roomId?: string) => {
  clearInvitedGroupCall(roomId);
};

export const restoreInvitedGroupCallFromUrl = async () => {
  await hydrateInvitedGroupCallFromUrl();
};

export const copyInviteGroupCallLink = async () => {
  return copyInvitedGroupCallLink();
};
