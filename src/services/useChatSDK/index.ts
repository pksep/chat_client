import {
  User,
  Topic,
  Group,
  Message,
  TopicSetting,
  Media
} from '@pksep/zod-shared-chat';

import {
  WebSocketEventType,
  WebSocketEventHandler,
  WebSocketEventPayloads
} from './websocketEvents';
import { Reqi } from '@pksep/reqi';
import io, { Socket } from 'socket.io-client';
import { SearchParams, PaginatedResponse, MessageStatus } from './types';

import { ChatAuth, ChatAuthInterface } from './auth';
import { ChatUser, ChatUserInterface } from './user';
import { ChatTopic, ChatTopicInterface } from './topic';
import { ChatMessage, ChatMessageInterface } from './message';
import { ChatGroup, ChatGroupInterface } from './group';
import { ChatMedia, ChatMediaInterface } from './media';
import { ChatWS, ChatWSInterface } from './ws';
import { ChatUtils, ChatUtilsInterface } from './utils';
import { ITopic } from '../../components/interfaces/interfaces';
import { fetchAllTopics } from '../../composables/useTopics';
import { getAuthToken } from '../../composables/useLogin';
import {
  isAuthError,
  tryRefreshErpSession,
  withErpRefreshOnAuthError
} from '../../composables/useAuth';
import { fetchMessagesForTopic } from '../useMessages';
import { getConfig } from '../useConfig';

export interface ChatSDKOptions {
  apiUrl: string;
  wsUrl: string;
  token?: string;
}

export interface WebSocketEvent {
  type: string;
  payload: any;
  timestamp?: Date;
}

export class ChatSDK {
  private apiUrl: string;
  private wsUrl: string;
  private token?: string;
  private socket: Socket | null = null;

  private auth: ChatAuthInterface;
  private user: ChatUserInterface;
  private topic: ChatTopicInterface;
  private message: ChatMessageInterface;
  private group: ChatGroupInterface;
  private media: ChatMediaInterface;
  private ws: ChatWSInterface;
  private utils: ChatUtilsInterface;

  private reqi: Reqi;

  constructor(options: ChatSDKOptions) {
    this.apiUrl = options.apiUrl;
    this.wsUrl = options.wsUrl;
    this.token = options.token;

    this.reqi = this.createReqiInstance();

    this.auth = new ChatAuth(this.apiUrl, this.token);
    this.user = new ChatUser(this.reqi);
    this.topic = new ChatTopic(this.reqi);
    this.message = new ChatMessage(this.reqi);
    this.group = new ChatGroup(this.reqi);
    this.media = new ChatMedia(this.reqi);
    this.ws = new ChatWS(null);
    this.utils = new ChatUtils(this.reqi);
  }

  private createReqiInstance(): Reqi {
    const reqi = new Reqi(this.apiUrl, {
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      }
    });

    reqi.request.use(async (request: Request): Promise<Request> => {
      const token = getAuthToken() || this.token;

      if (token) {
        request.headers.set('Authorization', `Bearer ${token}`);
      } else {
        request.headers.delete('Authorization');
      }

      return request;
    });

    const methodNames = ['get', 'post', 'put', 'patch', 'delete'] as const;

    for (const methodName of methodNames) {
      const originalMethod = (reqi as any)[methodName];

      if (typeof originalMethod !== 'function') {
        continue;
      }

      (reqi as any)[methodName] = (...args: any[]) => {
        return withErpRefreshOnAuthError(() =>
          originalMethod.apply(reqi, args)
        );
      };
    }

    return reqi;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let authReconnectAttempted = false;
      let isSettled = false;
      let initialConnectionTimeout: ReturnType<typeof setTimeout> | null = null;

      const clearInitialConnectionTimeout = () => {
        if (!initialConnectionTimeout) return;

        clearTimeout(initialConnectionTimeout);
        initialConnectionTimeout = null;
      };

      const resolveOnce = () => {
        if (isSettled) return;

        isSettled = true;
        clearInitialConnectionTimeout();
        resolve();
      };

      const rejectOnce = (error: unknown) => {
        if (isSettled) return;

        isSettled = true;
        clearInitialConnectionTimeout();
        reject(error);
      };

      try {
        console.info('Socket.IO: Initializing chat connection', {
          wsUrl: this.wsUrl
        });

        this.socket = io(this.wsUrl, {
          transports: ['websocket', 'polling'],
          tryAllTransports: true,
          auth: cb => {
            cb({
              token: getAuthToken() || this.token
            });
          },

          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 30000
        });

        initialConnectionTimeout = setTimeout(() => {
          rejectOnce(
            new Error(
              `Socket.IO: Initial connection timed out for ${this.wsUrl}`
            )
          );
        }, 30000);

        this.ws.setSocket(this.socket);

        this.socket.on('connect', () => {
          authReconnectAttempted = false;
          console.log('Socket.IO: Connected to chat server', {
            socketId: this.socket?.id,
            transport: this.socket?.io?.engine?.transport?.name,
            wsUrl: this.wsUrl
          });
          resolveOnce();

          fetchAllTopics();
        });

        this.socket.on('connect_error', async error => {
          if (!authReconnectAttempted && isAuthError(error)) {
            authReconnectAttempted = true;

            const refreshed = await tryRefreshErpSession();

            if (refreshed?.token && this.socket) {
              this.token = refreshed.token;
              console.warn(
                'Socket.IO: Retrying initial connection after token refresh'
              );
              this.socket.connect();
              return;
            }

            rejectOnce(error);
            return;
          }

          console.error('Socket.IO: Connection error:', error, {
            wsUrl: this.wsUrl,
            transport: this.socket?.io?.engine?.transport?.name,
            readyState: this.socket?.io?.engine?.readyState
          });
        });

        this.socket.on('disconnect', reason => {
          console.log('Socket.IO: Disconnected from chat server:', {
            reason,
            transport: this.socket?.io?.engine?.transport?.name,
            readyState: this.socket?.io?.engine?.readyState
          });
        });

        this.socket.on('reconnect_attempt', attemptNumber => {
          console.log(
            `Socket.IO: Attempting to reconnect (${attemptNumber})...`,
            {
              wsUrl: this.wsUrl,
              transport: this.socket?.io?.engine?.transport?.name
            }
          );
        });

        this.socket.on('reconnect', attemptNumber => {
          console.log(
            `Reconnected to chat server after ${attemptNumber} attempts`,
            {
              socketId: this.socket?.id,
              transport: this.socket?.io?.engine?.transport?.name
            }
          );
          fetchAllTopics();
          fetchMessagesForTopic();
        });

        this.socket.on('reconnect_error', error => {
          console.error('Reconnection error:', error, {
            wsUrl: this.wsUrl,
            transport: this.socket?.io?.engine?.transport?.name,
            readyState: this.socket?.io?.engine?.readyState
          });
        });

        this.socket.on('reconnect_failed', () => {
          console.error('Reconnection failed after maximum attempts');
        });

        this.socket.io.on('error', error => {
          console.error('Socket.IO manager error:', error, {
            wsUrl: this.wsUrl
          });
        });

        this.socket.io.engine.on('upgrade', transport => {
          console.log('Socket.IO: Transport upgraded', {
            transport: transport.name
          });
        });

        this.socket.io.engine.on('close', reason => {
          console.warn('Socket.IO engine closed', {
            reason,
            transport: this.socket?.io?.engine?.transport?.name
          });
        });

        this.socket?.on('newMessage', data => {
          const message: WebSocketEvent = {
            type: WebSocketEventType.NEW_MESSAGE,
            payload: data,
            timestamp: new Date()
          };
          this.handleWebSocketEvent(message);
        });

        this.socket?.on('messageUpdated', data => {
          const message: WebSocketEvent = {
            type: WebSocketEventType.MESSAGE_UPDATED,
            payload: data,
            timestamp: new Date()
          };
          this.handleWebSocketEvent(message);
        });

        this.socket?.on('messageDeleted', data => {
          const message: WebSocketEvent = {
            type: WebSocketEventType.MESSAGE_DELETED,
            payload: data,
            timestamp: new Date()
          };
          this.handleWebSocketEvent(message);
        });

        this.socket?.on('messagePinned', data => {
          const message: WebSocketEvent = {
            type: WebSocketEventType.MESSAGE_PINNED,
            payload: data,
            timestamp: new Date()
          };
          this.handleWebSocketEvent(message);
        });

        this.socket?.on('messagesRead', data => {
          const message: WebSocketEvent = {
            type: WebSocketEventType.MESSAGES_READ,
            payload: data,
            timestamp: new Date()
          };
          this.handleWebSocketEvent(message);
        });

        this.socket?.on('joined', data => {
          const message: WebSocketEvent = {
            type: WebSocketEventType.JOIN_TOPIC,
            payload: data,
            timestamp: new Date()
          };
          this.handleWebSocketEvent(message);
        });

        this.socket.onAny((event, ...args) => {
          let mappedEventType: WebSocketEventType | null = null;

          switch (event) {
            case 'newMessage':
              mappedEventType = WebSocketEventType.NEW_MESSAGE;
              break;
            case 'messageUpdated':
              mappedEventType = WebSocketEventType.MESSAGE_UPDATED;
              break;
            case 'messageDeleted':
              mappedEventType = WebSocketEventType.MESSAGE_DELETED;
              break;
            case 'messagePinned':
              mappedEventType = WebSocketEventType.MESSAGE_PINNED;
              break;
            case 'messagesRead':
              mappedEventType = WebSocketEventType.MESSAGES_READ;
              break;
            case 'joined':
              mappedEventType = WebSocketEventType.JOIN_TOPIC;
              break;
            case 'left':
              mappedEventType = WebSocketEventType.LEAVE_TOPIC;
              break;
            default:
              if (Object.values(WebSocketEventType).includes(event)) {
                mappedEventType = event as WebSocketEventType;
              }
              break;
          }

          if (mappedEventType) {
            const message: WebSocketEvent = {
              type: mappedEventType,
              payload: args[0],
              timestamp: new Date()
            };
            this.handleWebSocketEvent(message);
          }
        });
      } catch (error) {
        rejectOnce(error);
      }
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private authenticate(token: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('authenticate', { token });
    }
  }

  private handleWebSocketEvent(rawEvent: any): void {
    this.ws.handleWebSocketEvent(rawEvent);
  }

  subscribeToEvent<T extends WebSocketEventType>(
    type: T,
    handler: WebSocketEventHandler<T>
  ): void {
    this.ws.subscribeToEvent(type, handler);
  }

  unsubscribeFromEvent<T extends WebSocketEventType>(
    type: T,
    handler: WebSocketEventHandler<T>
  ): void {
    this.ws.unsubscribeFromEvent(type, handler);
  }

  sendWebSocketEvent<T extends WebSocketEventType>(
    type: T,
    payload: WebSocketEventPayloads[T]
  ): void {
    this.ws.sendWebSocketEvent(type, payload);
  }

  isConnected(): boolean {
    return !!this.socket?.connected;
  }

  reconnectIfNeeded(): void {
    if (!this.socket) {
      return;
    }

    if (!this.socket.connected) {
      console.info(
        'Socket.IO: Forcing reconnect after resume/visibility change'
      );
      this.socket.connect();
    }
  }

  async getUsers(params?: SearchParams): Promise<PaginatedResponse<User>> {
    return this.user.getUsers(params);
  }

  async createUser(userData: Partial<User>): Promise<User> {
    return this.user.createUser(userData);
  }

  async getUserProfile(userId: string): Promise<User> {
    return this.user.getUserProfile(userId);
  }

  async updateUserProfile(
    userId: string,
    profileData: Partial<User>
  ): Promise<User> {
    return this.user.updateUserProfile(userId, profileData);
  }

  async getRecentTopics(userId: string): Promise<Topic[]> {
    return this.user.getRecentTopics(userId);
  }

  async authenticateUser(credentials: {
    email: string;
    password: string;
  }): Promise<{ user: User; token: string }> {
    const result = await this.auth.authenticateUser(credentials);

    this.token = result.token;
    this.reqi = this.createReqiInstance();

    this.auth = new ChatAuth(this.apiUrl, this.token);

    return result;
  }

  async getTopics(): Promise<PaginatedResponse<ITopic>> {
    return this.topic.getTopics();
  }

  async createTopic(topicData: { peerId: string }): Promise<Topic> {
    return await this.topic.createTopic(topicData);
  }

  async deleteTopic(topicId: string): Promise<void> {
    return await this.topic.deleteTopic(topicId);
  }

  async togglePinTopic(topicId: string): Promise<TopicSetting> {
    return await this.topic.togglePinTopic(topicId);
  }

  async toggleMuteTopic(topicId: string): Promise<TopicSetting> {
    return await this.topic.toggleMuteTopic(topicId);
  }

  async getTopicSettings(
    topicId: string,
    userId: string
  ): Promise<TopicSetting> {
    return await this.topic.getTopicSettings(topicId, userId);
  }

  async updateTopicSettings(
    topicId: string,
    userId: string,
    settings: Partial<TopicSetting>
  ): Promise<TopicSetting> {
    return await this.topic.updateTopicSettings(topicId, userId, settings);
  }

  async leaveTopic(topicId: string): Promise<void> {
    return await this.topic.leaveTopic(topicId);
  }

  async getTopicById(topicId: string): Promise<Topic> {
    return await this.topic.getTopicById(topicId);
  }

  async getTopicParticipants(topicId: string): Promise<User[]> {
    return await this.topic.getTopicParticipants(topicId);
  }

  async createDMWithUser(peerId: string): Promise<Topic> {
    return await this.topic.createDMWithUser(peerId);
  }

  async updateTopic(
    topicId: string,
    topicData: Partial<{
      title?: string;
      description?: string;
      avatarUrl?: string;
    }>
  ): Promise<Topic> {
    return await this.topic.updateTopic(topicId, topicData);
  }

  async joinTopic(topicId: string): Promise<void> {
    this.ws.sendWebSocketEvent(WebSocketEventType.JOIN_TOPIC, { topicId });
  }

  async createGroup(groupData: {
    title: string;
    description?: string;
    avatarUrl?: string;
    memberIds: string[];
    admins: string[];
  }): Promise<Group> {
    return await this.group.createGroup(groupData);
  }

  async deleteGroup(groupId: string): Promise<void> {
    return await this.group.deleteGroup(groupId);
  }

  async getGroup(
    groupId: string
  ): Promise<{ group: Group; members: PaginatedResponse<User> }> {
    const topic = await this.group.getGroup(groupId);
    return topic;
  }

  async updateGroup(
    groupId: string,
    groupData: Partial<{
      title: string;
      description?: string;
      avatarUrl?: string;
      memberIds: string[];
      admins: string[];
    }>
  ): Promise<Group> {
    return await this.group.updateGroup(groupId, groupData);
  }

  async leaveGroup(groupId: string): Promise<void> {
    return await this.group.leaveGroup(groupId);
  }

  async addGroupMembers(groupId: string, userIds: string[]): Promise<User[]> {
    return await this.group.addGroupMembers(groupId, userIds);
  }

  async removeGroupMember(
    groupId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    const result = await this.group.removeGroupMember(groupId, userId);

    if (typeof result === 'number') {
      return { success: result > 0 };
    }
    return result;
  }

  async promoteToAdmin(
    groupId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    return await this.group.promoteToAdmin(groupId, userId);
  }

  async demoteFromAdmin(
    groupId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    return await this.group.demoteFromAdmin(groupId, userId);
  }

  async addUsersToGroup(
    groupId: string,
    userIds: string[]
  ): Promise<{ success: boolean; addedMembers: User[] }> {
    return await this.group.addUsersToGroup(groupId, userIds);
  }

  async removeUserFromGroup(
    groupId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    const result = await this.group.removeUserFromGroup(groupId, userId);

    if (typeof result === 'number') {
      return { success: result > 0 };
    }
    return result;
  }

  async editGroup(
    groupId: string,
    groupData: Partial<{
      title: string;
      description?: string;
      avatarUrl?: string;
      memberIds: string[];
      admins: string[];
    }>
  ): Promise<Group> {
    return await this.group.editGroup(groupId, groupData);
  }

  async getMessages(
    topicId: string,
    opts?: {
      limit?: number;
      lastMessageId?: string;
      afterMessageId?: string;
      newMessages?: boolean;
    }
  ): Promise<Message[]> {
    return await this.message.getMessages(topicId, opts);
  }

  async getPinnedMessages(topicId: string): Promise<Message[]> {
    return await this.message.getPinnedMessages(topicId);
  }

  async getAroundMessage(messageId: string): Promise<Message[]> {
    return await this.message.getAroundMessage(messageId);
  }

  async editMessage(
    topicId: string,
    messageId: string,
    content: string
  ): Promise<Message> {
    return await this.message.editMessage(topicId, messageId, content);
  }

  async deleteMessage(topicId: string, messageId: string): Promise<void> {
    return await this.message.deleteMessage(topicId, messageId);
  }

  async toggleMessageReaction(
    topicId: string,
    messageId: string,
    emoji: string
  ): Promise<{ success: boolean }> {
    return await this.message.toggleMessageReaction(topicId, messageId, emoji);
  }

  async markMessagesAsRead(
    topicId: string,
    messageIds: string[]
  ): Promise<void> {
    this.socket.emit(WebSocketEventType.READ_MESSAGE, { messageIds, topicId });
  }

  async uploadFile(
    file: File
  ): Promise<{ objectName: string; thumbnailObjectName: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = (await this.reqi.post<Media>('/media/upload', formData, {
      parsed: false
    })) as any;
    const data = await response.json();
    return {
      objectName: data.objectName,
      thumbnailObjectName: data.thumbnailObjectName
    };
  }

  async updateMessageStatus(
    messageId: string,
    status: MessageStatus
  ): Promise<{ success: boolean }> {
    return await this.message.updateMessageStatus(messageId, status);
  }

  async searchMessages(
    query: string,
    params?: SearchParams
  ): Promise<PaginatedResponse<Message & { topic: Topic }>> {
    return await this.utils.searchMessages(query, params);
  }

  async searchTopics(
    query: string,
    params?: SearchParams
  ): Promise<PaginatedResponse<Topic>> {
    return await this.utils.searchTopics(query, params);
  }

  async getUnreadCounts(): Promise<{
    totalUnread: number;
    topicsUnread: { [topicId: string]: number };
  }> {
    return await this.utils.getUnreadCounts();
  }

  getConfig() {
    return getConfig();
  }

  async getLiveKitToken(
    roomId: string,
    userId: string
  ): Promise<string | null> {
    try {
      const response = (await this.reqi.get<{ token: string }>(
        `/calls/livekit-token?roomId=${encodeURIComponent(roomId)}&userId=${encodeURIComponent(userId)}`,
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data.token;
    } catch (error) {
      console.error('[LiveKit] Failed to fetch call token:', error);
      return null;
    }
  }

  async createGroupCallInvite(roomId: string): Promise<{
    inviteToken: string;
    roomId: string;
    topicId: string;
  } | null> {
    try {
      const response = (await this.reqi.get<{
        invite: {
          inviteToken: string;
          roomId: string;
          topicId: string;
        };
      }>(`/calls/invite-link?roomId=${encodeURIComponent(roomId)}`, {
        parsed: false
      })) as any;
      const data = await response.json();
      return data.invite || null;
    } catch (error) {
      console.error('[LiveKit] Failed to create invite link:', error);
      return null;
    }
  }

  async getGroupCallInvitePreview(
    roomId: string,
    inviteToken: string
  ): Promise<{
    roomId: string;
    topicId: string;
    title: string;
    avatarUrl?: string | null;
    participantCount: number;
    members: User[];
  } | null> {
    try {
      const response = (await this.reqi.get<{
        preview: {
          roomId: string;
          topicId: string;
          title: string;
          avatarUrl?: string | null;
          participantCount: number;
          members: User[];
        };
      }>(
        `/calls/invite-preview?roomId=${encodeURIComponent(roomId)}&invite=${encodeURIComponent(inviteToken)}`,
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data.preview || null;
    } catch (error) {
      console.error('[LiveKit] Failed to fetch invite preview:', error);
      return null;
    }
  }

  async getInviteLiveKitToken(
    roomId: string,
    inviteToken: string
  ): Promise<string | null> {
    try {
      const response = (await this.reqi.get<{ token: string }>(
        `/calls/invite-livekit-token?roomId=${encodeURIComponent(roomId)}&invite=${encodeURIComponent(inviteToken)}`,
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data.token;
    } catch (error) {
      console.error('[LiveKit] Failed to fetch invite call token:', error);
      return null;
    }
  }
}
