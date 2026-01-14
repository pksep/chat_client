import { Message, Topic, User, Group } from '@pksep/zod-shared-chat';

export enum WebSocketEventType {
  JOIN_TOPIC = 'joinTopic',
  LEAVE_TOPIC = 'leaveTopic',
  SEND_MESSAGE = 'sendMessage',
  NEW_MESSAGE = 'newMessage',
  EDIT_MESSAGE = 'editMessage',
  MESSAGE_UPDATED = 'messageUpdated',
  DELETE_MESSAGE = 'deleteMessage',
  MESSAGE_DELETED = 'messageDeleted',
  TOGGLE_REACTION = 'toggleReaction',
  REACTION_UPDATED = 'reactionUpdated',
  TOGGLE_PIN = 'togglePin',
  MESSAGE_PINNED = 'messagePinned',
  READ_MESSAGES = 'readMessages',
  MESSAGES_READ = 'messagesRead',
  TOPIC_CREATED = 'TOPIC_CREATED',
  TOPIC_DELETED = 'TOPIC_DELETED',
  TOPIC_PINNED = 'TOPIC_PINNED',
  TOPIC_UNPINNED = 'TOPIC_UNPINNED',
  TOPIC_MUTED = 'TOPIC_MUTED',
  TOPIC_UNMUTED = 'TOPIC_UNMUTED',
  GROUP_CREATED = 'GROUP_CREATED',
  GROUP_UPDATED = 'GROUP_UPDATED',
  GROUP_DELETED = 'GROUP_DELETED',
  MEMBER_ADDED = 'MEMBER_ADDED',
  MEMBER_REMOVED = 'MEMBER_REMOVED',
  MEMBER_LEFT = 'MEMBER_LEFT',
  USER_JOINED = 'USER_JOINED',
  USER_LEFT = 'USER_LEFT',
  USER_UPDATED = 'USER_UPDATED',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  AUTHENTICATED = 'AUTHENTICATED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  REQUEST_MESSAGE_HISTORY = 'REQUEST_MESSAGE_HISTORY',
  MESSAGE_HISTORY_RESPONSE = 'MESSAGE_HISTORY_RESPONSE'
}

export interface WebSocketEventPayloads {
  [WebSocketEventType.JOIN_TOPIC]: { topicId: string };
  [WebSocketEventType.LEAVE_TOPIC]: { topicId: string };
  [WebSocketEventType.SEND_MESSAGE]: {
    topicId: string;
    text?: string;
    media?: any[];
    replayMessageId?: string;
  };
  [WebSocketEventType.NEW_MESSAGE]: Message;
  [WebSocketEventType.EDIT_MESSAGE]: { messageId: string; text: string };
  [WebSocketEventType.MESSAGE_UPDATED]: Message;
  [WebSocketEventType.DELETE_MESSAGE]: { messageId: string; topicId: string };
  [WebSocketEventType.MESSAGE_DELETED]: { messageId: string };
  [WebSocketEventType.TOGGLE_REACTION]: {
    messageId: string;
    emoji: string;
    topicId: string;
  };
  [WebSocketEventType.REACTION_UPDATED]: any; // Server sends reaction toggle result
  [WebSocketEventType.TOGGLE_PIN]: { messageId: string };
  [WebSocketEventType.MESSAGE_PINNED]: { messageId: string; isPin: boolean };
  [WebSocketEventType.READ_MESSAGES]: { messageIds: string[]; topicId: string };
  [WebSocketEventType.MESSAGES_READ]: { userId: string; messageIds: string[] };
  [WebSocketEventType.TOPIC_CREATED]: Topic;
  [WebSocketEventType.TOPIC_DELETED]: { topicId: string };
  [WebSocketEventType.TOPIC_PINNED]: Topic;
  [WebSocketEventType.TOPIC_UNPINNED]: Topic;
  [WebSocketEventType.TOPIC_MUTED]: Topic;
  [WebSocketEventType.TOPIC_UNMUTED]: Topic;
  [WebSocketEventType.GROUP_CREATED]: Group;
  [WebSocketEventType.GROUP_UPDATED]: Group;
  [WebSocketEventType.GROUP_DELETED]: { groupId: string };
  [WebSocketEventType.MEMBER_ADDED]: { groupId: string; user: User };
  [WebSocketEventType.MEMBER_REMOVED]: { groupId: string; userId: string };
  [WebSocketEventType.MEMBER_LEFT]: { groupId: string; userId: string };
  [WebSocketEventType.USER_JOINED]: User;
  [WebSocketEventType.USER_LEFT]: User;
  [WebSocketEventType.USER_UPDATED]: User;
  [WebSocketEventType.CONNECTED]: null;
  [WebSocketEventType.DISCONNECTED]: null;
  [WebSocketEventType.AUTHENTICATED]: { userId: string };
  [WebSocketEventType.AUTHENTICATION_FAILED]: { error: string };
  [WebSocketEventType.REQUEST_MESSAGE_HISTORY]: {
    topicId: string;
    requestId: string;
    limit?: number;
    page?: number;
  };
  [WebSocketEventType.MESSAGE_HISTORY_RESPONSE]: {
    requestId: string;
    messages: Message[];
    error?: string;
  };
}

export interface WebSocketEvent<
  T extends WebSocketEventType = WebSocketEventType
> {
  type: T;
  payload: WebSocketEventPayloads[T];
  timestamp: Date;
}

export type WebSocketEventHandler<
  T extends WebSocketEventType = WebSocketEventType
> = (event: WebSocketEvent<T>) => void;
