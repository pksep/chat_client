import type {
  User,
  TopicSetting,
  Topic,
  Message,
  Group,
  Media,
  Reaction
} from '@pksep/zod-shared-chat';

export interface IHeaderProps {
  contact?: IUser;
  members?: IUser[];
  dataTestid?: string;
  displayRoute?: IHeaderDisplayRoute | null;
}

export interface IHeaderDisplayRoute {
  type: string;
  id: string | null;
}

export interface IMessageRenderedTopicState {
  topicId: string | null;
  routeTopicId: string | null;
  messageCount: number;
  isCurrent: boolean;
  isReady?: boolean;
}

export interface IMenuEmits {
  (e: 'unmount-collapse', isCollapse: boolean): void;
  (e: 'unmount-new-contact', config: { isChapterOpen?: boolean }): void;
  (e: 'unmount-new-group', config: { isChapterOpen?: boolean }): void;
  (e: 'unmount-new-bot', config: { isChapterOpen?: boolean }): void;
  (e: 'unmount-contacts-update', contacts: IUser[]): void;
}

export interface IHeaderEmits {
  (e: 'unmount-collapse', isCollapse: boolean): void;
  (e: 'unmount-new-contact', config: { isChapterOpen?: boolean }): void;
  (e: 'unmount-click', isCollapse?: boolean): void;
  (e: 'unmount-contact', contact: IUser): void;
  (e: 'unmount-notification', statusNotification?: string): void;
  (e: 'unmount-information', info?: boolean): void;
  (e: 'unmount-user-profile', info?: boolean): void;
  (e: 'unmount-clear'): void;
  (e: 'unmount-exit'): void;
}

export interface ITopicPropsEmits {
  (e: 'unmount-select', topic?: ITopic): void;
}

export interface IUserStatus {
  icon: string;
  text: string;
}

export type IUser = User & {
  isBot?: boolean;
  status?: IUserStatus | null;
  ex?: unknown;
};

export type IGroup = Group & {
  members?: IUser[];
  membersLength?: number;
};

export type ITopicInfo = Partial<TopicSetting> & {
  isMarkedUnread?: boolean;
  pinnedAt?: string | Date;
};

export type ITopic = Topic & {
  info?: ITopicInfo;
  isFavorite?: boolean;
  isPin?: boolean;
  lastMessage?: IMessage;
  activeCall?: {
    roomId: string;
    startTime?: number | null;
    participantCount?: number;
    callType?: string;
    groupMode?: boolean;
    elapsedDurationMs?: number;
  } | null;
  members?: IUser[];
  group?: Group;
  user?: IUser;
  name?: string;
  avatarUrl?: string;
  unreadMessageCount?: number;
  isAdmin?: boolean;
  taggedMe?: boolean;
  hasUnreadReaction?: boolean;
  unreadReactionMessageId?: string;
  typingUserIds?: string[];
};

export interface IMenuProps {
  open?: boolean;
  dataTestid?: string;
  class?: string;
}

export interface IMenuRightProps extends IMenuProps {
  members?: IUser[];
  activeTabId?: number;
  groupId?: string;
  excludedContactIds?: Set<string | number>;
}

export type IMedia = Media & {
  size: number;
  originName: string;
  uploadPercent?: number | null;
  uploadError?: boolean;
  ex?: {
    width?: number;
    height?: number;
    previewWidth?: number;
    previewHeight?: number;
    fillPreview?: boolean;
    processingStatus?: string;
    mediaProcessing?: { status?: string };
  };
  isLoading?: boolean;
  thumbnailPath?: string | null;
  localPath?: string;
  localThumbnailPath?: string;
};

export interface IMessageRead {
  id: string;
  messageId: string;
  userId: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export enum MessageStatusEnum {
  READ = 'READ',
  DELIVERED = 'DELIVERED',
  WAIT = 'WAIT',
  NOT_DELIVERED = 'NOT_DELIVERED'
}

export interface IChatContainerConfig {
  CHAT_MASTRA_URL?: string;
  CHAT_AUTH_API?: string;
  CHAT_API_DOMAIN?: string;
  CHAT_WS_DOMAIN?: string;
  CHAT_ERP_URL?: string;
  CHAT_PATH_TO_FILE_CDN?: string;
  CHAT_LIVEKIT_URL?: string;
  CHAT_URL?: string;
  CHAT_BOT_GATEWAY?: string;
  CHAT_CALL_TOPIC_AUTO_PROMPT_ENABLED?: string;
  CHAT_MULTIPART_UPLOAD_CONCURRENCY?: string;
}

export interface IChatContainerProps {
  baseUrl?: string;
  dataTestid?: string;
  config?: IChatContainerConfig;
}

export interface IChatContainerEmits {
  (e: 'unmount-notification-count', count: number): number;
}

export interface IUserProfileProps {
  user: IUser;
  dataTestid?: string;
  typingLabel?: string;
  description?: string;
  hideDeletedAccountStatus?: boolean;
}

export interface IGroupProfileProps {
  topic?: ITopic | null;
  dataTestid?: string;
  typingLabel?: string;
  description?: string;
}

export type IMessage = Message & {
  senderUser?: IUser;
  media?: IMedia[];
  messageRead?: IMessageRead[];
  isReadByMe?: boolean;
  isRead?: boolean;
  isPinnedForAll?: boolean;
  isPinnedForMe?: boolean;
  isPinnedOnlyMe?: boolean;
  replyMessage?: IMessage;
  replyQuoteText?: string;
  replyQuoteOccurrenceIndex?: number;
  forwardUser?: IUser;
  reactions?: Reaction[];
  ex?: string; // "{ clientId: string }"
  taggedUserIds?: string[];
};

export interface IMessageViewportSnapshot {
  anchorMessageId: string;
  anchorRelativeTop: number;
  firstVisibleIndex: number;
  lastVisibleIndex: number;
  visibleMessageIds: string[];
}

export enum MobilePlatformEnum {
  ANDROID = 'android',
  APPLE = 'apple'
}

export interface ITopicSelectorProps {
  topic?: ITopic | null;
  dataTestid?: string;
}

declare global {
  const __APP_VERSION__: string;
}
