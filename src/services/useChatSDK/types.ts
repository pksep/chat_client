import {
  Media,
  Reaction,
  Message,
  Topic,
  TopicSetting,
  User,
  Group
} from '@pksep/zod-shared-chat';

export interface PaginatedResponse<T = any> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SearchParams {
  page?: number | null;
  limit?: number | null;
  search?: string | null;
  type?: string | null;
}

export enum TopicType {
  Group = 'GROUP',
  DM = 'DM'
}

export interface TopicSettingWithUser extends TopicSetting {
  user?: User;
}

export enum MessageStatus {
  Delivery = 'DELIVERED',
  Wait = 'WAIT',
  NotDelivered = 'NOT_DELIVERED',
  Read = 'READ'
}

export type { Media, Reaction, Message, Topic, TopicSetting, User, Group };

export interface TopicChangePayload {
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  topicId: string;
  data:
    | {
        avatarUrl?: string;
        name?: string;
      }
    | { id: string };
}
