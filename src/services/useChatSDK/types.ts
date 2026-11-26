import {
  Media,
  Reaction,
  Message,
  Topic,
  TopicSetting,
  User,
  Group
} from '@pksep/zod-shared-chat';
import type { TopicSyncState } from '../../utils/topic-sync';

export interface PaginatedResponse<T = any> {
  data: T[];
  unreadTopics?: T[];
  sync?: TopicSyncState;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  meta?: PaginatedMeta;
}

export interface SearchParams {
  includePinComments?: boolean;
  page?: number | null;
  limit?: number | null;
  search?: string | null;
  type?: string | null;
  topicId?: string | null;
}

export interface CallHistoryItem {
  id: string;
  topicId: string;
  sourceTopicId?: string | null;
  callTopicId?: string | null;
  callTopicType?: 'GROUP' | 'DM' | null;
  roomId?: string | null;
  topicType: 'GROUP' | 'DM';
  topicName: string;
  topicAvatarUrl?: string | null;
  senderUserId: string;
  text: string;
  ex: unknown;
  createdAt: string | Date;
  callSummary?: {
    id: string;
    roomId: string;
    topicId: string | null;
    recorderUserId: string;
    recorderName?: string | null;
    status: 'STARTING' | 'RECORDING' | 'PROCESSING' | 'READY' | 'FAILED';
    videoStatus: 'STARTING' | 'RECORDING' | 'PROCESSING' | 'READY' | 'FAILED';
    videoAvailable: boolean;
    hasTranscript: boolean;
    createdAt: string | Date;
    completedAt?: string | Date | null;
  } | null;
}

export interface PaginatedMeta {
  totalItems: number;
  totalPages: number;
  currentPage: number;
}

export interface CallHistoryResponse {
  data: CallHistoryItem[];
  meta: PaginatedMeta;
}

export enum TopicType {
  Group = 'GROUP',
  DM = 'DM'
}

export interface TopicSettingWithUser extends TopicSetting {
  user?: User;
}

export enum MessageStatus {
  Sent = 'SENT',
  Delivery = 'DELIVERED',
  Wait = 'WAIT',
  NotDelivered = 'NOT_DELIVERED',
  Read = 'READ'
}

export type { Media, Reaction, Message, Topic, TopicSetting, User, Group };
