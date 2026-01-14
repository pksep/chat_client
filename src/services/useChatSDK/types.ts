export interface BaseEntity {
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt?: Date | string;
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
  Group = 'GROUP',
  DM = 'DM'
}

export interface TopicSettingWithUser extends BaseEntity {
  userId: string;
  topicId: string;
  isMute: boolean;
  isPin: boolean;
  user?: User;
}

export interface Topic extends BaseEntity {
  id: string;
  type: TopicType;
  /** Settings with user info, populated when fetching DM topics */
  settings?: TopicSettingWithUser[];
  user?: User;
  info?: TopicSettingWithUser;
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
  avatarUrl: string | null;
  lastOnline: Date | string | null;
  topics?: Topic[];
}

export interface Group extends BaseEntity {
  id: string;
  topicId: string;
  title: string;
  description: string;
  avatarUrl: string | null;
  members: User[];
  admins: User[];
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    totalItems: number;
    totalPages: number;
    itemsPerPage: number;
    currentPage: number;
  };
}

export interface SearchParams {
  search?: string;
  page?: number;
  limit?: number;
}
