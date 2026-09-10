import { Message, Topic, User, Group, Reaction } from '@pksep/zod-shared-chat';
import { IMedia, ITopic } from 'src/components/interfaces/interfaces';

export interface PtsMeta {
  eventId: string;
  pts: string;
  topicId: string;
}

export interface SyncReplayEvent {
  eventId: string;
  pts: string;
  topicId: string;
  eventType: string;
  payload: Record<string, any>;
  createdAt?: Date | string;
}

export enum WebSocketEventType {
  SYNC_STATE = 'syncState',
  SYNC_REPLAY = 'syncReplay',
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
  MARK_REACTION_SEEN = 'markReactionSeen',
  REACTION_SEEN = 'reactionSeen',
  TOGGLE_PIN_MESSAGE = 'togglePinMessage',
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
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  AUTHENTICATED = 'AUTHENTICATED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  REQUEST_MESSAGE_HISTORY = 'REQUEST_MESSAGE_HISTORY',
  MESSAGE_HISTORY_RESPONSE = 'MESSAGE_HISTORY_RESPONSE',
  CHANGE_TOPIC = 'changeTopic',
  CHANGE_MESSAGE = 'changeMessage',
  READ_MESSAGE = 'readMessage',
  USER_UPDATED = 'userUpdated',
  TYPING_STATUS = 'typingStatus',
  TOGGLE_PRESENCE = 'togglePresence',
  ACTIVE_CALLS = 'activeCalls',
  START_CALL = 'startCall',
  INCOMING_CALL = 'incomingCall',
  DISMISS_INCOMING_CALL = 'dismissIncomingCall',
  ANSWER_CALL = 'answerCall',
  CALL_ANSWERED = 'callAnswered',
  CALL_CLIENT_CLOSING = 'callClientClosing',
  END_CALL = 'endCall',
  CALL_ENDED = 'callEnded',
  CALL_PARTICIPANT_LEFT = 'callParticipantLeft',
  CALL_SUMMARY_STATUS = 'callSummaryStatus',
  CALL_SUMMARY_RECORDING_STARTED = 'callSummaryRecordingStarted'
}

export interface WebSocketEventPayloads {
  [WebSocketEventType.SYNC_STATE]: { pts?: string };
  [WebSocketEventType.SYNC_REPLAY]: {
    fromPts?: string | null;
    toPts?: string | null;
    events: SyncReplayEvent[];
  };
  [WebSocketEventType.JOIN_TOPIC]: { topicId: string };
  [WebSocketEventType.LEAVE_TOPIC]: { topicId: string };
  [WebSocketEventType.SEND_MESSAGE]: {
    topicId: string;
    text?: string;
    medias?: IMedia[];
    replyMessageId?: string;
    forwardMessageId?: string;
    ex?: string;
    taggedUserIds?: string[];
  };
  [WebSocketEventType.TOGGLE_PIN_MESSAGE]: {
    messageId: string;
    topicId: string;
    userId: string;
    scope?: 'ALL' | 'SELF';
  };
  [WebSocketEventType.CHANGE_MESSAGE]: {
    data: Message;
    type: 'NEW' | 'CHANGE' | 'DELETE' | 'PIN';
    messageId: string;
    ptsMeta?: PtsMeta;
    scope?: 'ALL' | 'SELF';
    targetUserId?: string | null;
  };
  [WebSocketEventType.READ_MESSAGE]: {
    messageIds: string[];
    topicId: string;
    reachedEnd?: boolean;
    userId?: string;
    ptsMeta?: PtsMeta;
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
  [WebSocketEventType.REACTION_UPDATED]: {
    action: 'added' | 'updated' | 'removed';
    messageId: string;
    reactionId?: string;
    topicId: string;
    reaction?: Reaction;
    messageSenderUserId?: string;
    reactionSenderUserId?: string;
    ptsMeta?: PtsMeta;
  };
  [WebSocketEventType.MARK_REACTION_SEEN]: {
    topicId: string;
  };
  [WebSocketEventType.REACTION_SEEN]: {
    topicId: string;
    userId: string;
    lastSeenReactionAt: string;
    ptsMeta?: PtsMeta;
  };
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
  [WebSocketEventType.USER_UPDATED]: {
    id: string;
    initials?: string;
    nickname?: string;
    avatarUrl?: string | null;
    ex?: unknown;
    isBot?: boolean;
    lastOnline: Date | string | null;
    status?: {
      icon: string;
      text: string;
    } | null;
    ptsMeta?: PtsMeta;
  };
  [WebSocketEventType.TYPING_STATUS]: {
    topicId: string;
    userId?: string;
    isTyping: boolean;
  };
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
  [WebSocketEventType.CHANGE_TOPIC]: {
    data: ITopic;
    type: 'CREATE' | 'UPDATE';
    topicId: string;
    ptsMeta?: PtsMeta;
  };
  [WebSocketEventType.TOGGLE_PRESENCE]: { isActive: boolean };
  [WebSocketEventType.ACTIVE_CALLS]: {
    calls: Array<{
      roomId: string;
      topicId?: string | null;
      callType: string;
      startTime?: number | null;
      participantCount?: number;
      groupMode?: boolean;
      elapsedDurationMs?: number;
    }>;
    replace?: boolean;
  };
  [WebSocketEventType.START_CALL]: {
    userId: string;
    roomId: string;
    topicId?: string | null;
  };
  [WebSocketEventType.DISMISS_INCOMING_CALL]: {
    roomId: string;
    topicId?: string | null;
  };
  [WebSocketEventType.ANSWER_CALL]: {
    userId: string;
    roomId: string;
    topicId?: string | null;
    inviteToken?: string;
  };
  [WebSocketEventType.CALL_ANSWERED]: {
    userId: string;
    roomId: string;
    topicId?: string | null;
    startTime?: number | null;
    elapsedDurationMs?: number;
  };
  [WebSocketEventType.CALL_CLIENT_CLOSING]: {
    userId: string;
    roomId: string;
    topicId?: string | null;
    source: 'beforeunload' | 'pagehide';
  };
  [WebSocketEventType.END_CALL]: {
    userId: string;
    roomId: string;
    topicId?: string | null;
  };
  [WebSocketEventType.CALL_ENDED]: {
    userId: string;
    roomId: string;
    topicId?: string | null;
    reason?: 'busy';
  };
  [WebSocketEventType.CALL_PARTICIPANT_LEFT]: {
    participantId: string;
    roomId: string;
    topicId?: string | null;
  };
  [WebSocketEventType.CALL_SUMMARY_STATUS]: {
    id: string;
    roomId: string;
    topicId: string | null;
    recorderUserId: string;
    status: 'STARTING' | 'RECORDING' | 'PROCESSING' | 'READY' | 'FAILED';
    videoStatus: 'STARTING' | 'RECORDING' | 'PROCESSING' | 'READY' | 'FAILED';
    videoAvailable: boolean;
    hasTranscript?: boolean;
    transcript?: string | null;
    createdAt: Date | string;
    completedAt?: Date | string | null;
  };
  [WebSocketEventType.CALL_SUMMARY_RECORDING_STARTED]: {
    summaryId?: string | null;
    roomId: string;
    topicId: string | null;
    recorderUserId: string;
    recorderName?: string | null;
  };
  [WebSocketEventType.INCOMING_CALL]: {
    roomId: string;
    callerId: string;
    topicId?: string | null;
    callType?: string;
    startTime?: number | null;
    topicType?: string | null;
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
