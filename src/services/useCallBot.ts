import { computed, ref } from 'vue';
import { TopicType } from './useChatSDK/types';
import type { CallSummaryDto } from './useCallSummaries';

export interface CallBotCallSummaryBrief {
  id: string;
  roomId: string;
  topicId: string;
  recorderUserId: string;
  recorderName?: string | null;
  status: CallSummaryDto['status'];
  videoStatus: CallSummaryDto['videoStatus'];
  videoAvailable: boolean;
  hasSummary: boolean;
  createdAt: string | Date;
  completedAt?: string | Date | null;
}

export interface CallBotSelectedCall {
  messageId: string;
  topicId: string;
  roomId?: string | null;
  topicType: TopicType;
  displayName: string;
  avatarUrl?: string | null;
  avatarInitials: string;
  dateLabel: string;
  fullDateLabel: string;
  title: string;
  duration: string | null;
  detailLabel: string;
  timeLabel: string;
  createdAt: number;
  callSummary?: CallBotCallSummaryBrief | null;
}

const selectedCall = ref<CallBotSelectedCall | null>(null);

export const selectCallForBot = (call: CallBotSelectedCall): void => {
  selectedCall.value = { ...call };
};

export const clearCallBotSelection = (): void => {
  selectedCall.value = null;
};

export const useCallBot = () => ({
  selectedCall,
  hasSelectedCall: computed(() => !!selectedCall.value)
});
