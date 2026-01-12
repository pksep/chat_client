import { Message, Reaction, Topic, User, Group } from './types';

export enum WebSocketEventType {
  MESSAGE_RECEIVED = 'MESSAGE_RECEIVED',
  MESSAGE_EDITED = 'MESSAGE_EDITED',
  MESSAGE_DELETED = 'MESSAGE_DELETED',
  MESSAGE_PINNED = 'MESSAGE_PINNED',
  MESSAGE_UNPINNED = 'MESSAGE_UNPINNED',
  REACTION_ADDED = 'REACTION_ADDED',
  REACTION_REMOVED = 'REACTION_REMOVED',
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
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED'
}

export interface WebSocketEventPayloads {
  [WebSocketEventType.MESSAGE_RECEIVED]: Message;
  [WebSocketEventType.MESSAGE_EDITED]: Message;
  [WebSocketEventType.MESSAGE_DELETED]: { messageId: string };
  [WebSocketEventType.MESSAGE_PINNED]: Message;
  [WebSocketEventType.MESSAGE_UNPINNED]: Message;
  [WebSocketEventType.REACTION_ADDED]: Reaction;
  [WebSocketEventType.REACTION_REMOVED]: { reactionId: string };
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
