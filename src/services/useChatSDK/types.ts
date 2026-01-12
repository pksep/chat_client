export interface BaseEntity {
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export enum MediaType {
  Image = 'Image',
  Video = 'Video',
  File = 'File'
}

export interface Media extends BaseEntity {
  id: string;
  path: string;
  messageId: string;
  type: MediaType;
}

export interface Reaction extends BaseEntity {
  id: string;
  text: string;
  senderUser: string;
  messageId: string;
}

export enum MessageStatus {
  Read = 'read',
  Delivery = 'delivery',
  Wait = 'wait',
  NotDelivered = 'notDelivered'
}

export interface Message extends BaseEntity {
  id: string;
  senderUser: string;
  topicId: string;
  reactions: Reaction[];
  text?: string;
  replayMessageId?: string;
  media: Media[];
  isEdit: boolean;
  status: MessageStatus;
  isPin: boolean;
  isSystem?: boolean;
}

export enum TopicType {
  Group = 'Group',
  DM = 'DM'
}

export interface Topic extends BaseEntity {
  id: string;
  type: TopicType;
}

export interface TopicSetting extends BaseEntity {
  userId: string;
  topicId: string;
  isMute: boolean;
  isPin: boolean;
}

export interface User extends BaseEntity {
  id: string;
  initials: string;
  nickname: string;
  avatarUrl: string;
  lastOnline: Date;
  topics?: Topic[];
}

export interface Group extends BaseEntity {
  id: string;
  topicId: string;
  title: string;
  description: string;
  avatarUrl: string;
  members: User[];
  admins: User[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface SearchParams {
  search?: string;
  page?: number;
  limit?: number;
}
