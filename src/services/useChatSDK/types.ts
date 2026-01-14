import {
  MediaType,
  Media,
  Reaction,
  Message,
  Topic,
  TopicSetting,
  User,
  Group
} from '@pksep/zod-shared-chat';

// Define MediaTypeType locally since it's not exported from the shared package
export type MediaTypeType = 'IMAGE' | 'VIDEO' | 'FILE';

// Define BaseEntity locally since it's not exported from the shared package
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

// Define PaginatedResponse and SearchParams locally since they're not exported from the shared package
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

// Define TopicType enum locally since it's not exported from the shared package
export enum TopicType {
  Group = 'GROUP',
  DM = 'DM'
}

// Define TopicSettingWithUser locally since it's not exported from the shared package
export interface TopicSettingWithUser extends TopicSetting {
  user?: User;
}

// Define MessageStatus enum locally since it's not exported from the shared package
export enum MessageStatus {
  Delivery = 'DELIVERED',
  Wait = 'WAIT',
  NotDelivered = 'NOT_DELIVERED',
  Read = 'READ'
}

// Export the types to maintain the same interface for other modules
export type {
  Media,
  Reaction,
  Message,
  Topic,
  TopicSetting,
  User,
  Group
};
