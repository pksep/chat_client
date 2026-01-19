import {
  User,
  Topic,
  Group,
  Message,
  TopicSetting,
  MediaType,
  Media,
  MediaTypeType
} from '@pksep/zod-shared-chat';

import { S3Service, S3Config } from './s3Service';
import {
  WebSocketEventType,
  WebSocketEventHandler,
  WebSocketEventPayloads
} from './websocketEvents';
import { Reqi } from '@pksep/reqi';
import io, { Socket } from 'socket.io-client';
import {
  SearchParams,
  PaginatedResponse,
  TopicType,
  MessageStatus
} from './types';

import { ChatAuth, ChatAuthInterface } from './auth';
import { ChatUser, ChatUserInterface } from './user';
import { ChatTopic, ChatTopicInterface } from './topic';
import { ChatMessage, ChatMessageInterface } from './message';
import { ChatGroup, ChatGroupInterface } from './group';
import { ChatMedia, ChatMediaInterface } from './media';
import { ChatWS, ChatWSInterface } from './ws';
import { ChatUtils, ChatUtilsInterface } from './utils';
import { ITopic } from '../../components/interfaces/interfaces';

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

  private s3Service?: S3Service;
  private reqi: Reqi;

  constructor(options: ChatSDKOptions, s3Config?: S3Config) {
    this.apiUrl = options.apiUrl;
    this.wsUrl = options.wsUrl;
    this.token = options.token;

    this.reqi = new Reqi(this.apiUrl, {
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      }
    });

    this.s3Service = new S3Service(this.reqi);
    this.auth = new ChatAuth(this.apiUrl, this.token);
    this.user = new ChatUser(this.reqi);
    this.topic = new ChatTopic(this.reqi);
    this.message = new ChatMessage(this.reqi, this.s3Service);
    this.group = new ChatGroup(this.reqi);
    this.media = new ChatMedia(this.reqi);
    this.ws = new ChatWS(null);
    this.utils = new ChatUtils(this.reqi);
  }

  private createReqiInstance(): Reqi {
    return new Reqi(this.apiUrl, {
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      }
    });
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = io(this.wsUrl, {
          transports: ['websocket'],
          auth: {
            token: this.token
          },

          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 20000
        });

        this.ws.setSocket(this.socket);

        this.socket.on('connect', () => {
          console.log('Connected to chat server');
          resolve();
        });

        this.socket.on('connect_error', error => {
          console.error('Socket.IO connection error:', error);
          reject(error);
        });

        this.socket.on('disconnect', reason => {
          console.log('Disconnected from chat server:', reason);
        });

        this.socket.on('reconnect_attempt', attemptNumber => {
          console.log(`Attempting to reconnect (${attemptNumber})...`);
        });

        this.socket.on('reconnect', attemptNumber => {
          console.log(
            `Reconnected to chat server after ${attemptNumber} attempts`
          );
        });

        this.socket.on('reconnect_error', error => {
          console.error('Reconnection error:', error);
        });

        this.socket.on('reconnect_failed', () => {
          console.error('Reconnection failed after maximum attempts');
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

        this.socket?.on('reactionUpdated', data => {
          const message: WebSocketEvent = {
            type: WebSocketEventType.REACTION_UPDATED,
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
            case 'reactionUpdated':
              mappedEventType = WebSocketEventType.REACTION_UPDATED;
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
        reject(error);
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

  async getTopics(
    type?: TopicType,
    params?: SearchParams
  ): Promise<PaginatedResponse<ITopic>> {
    return this.topic.getTopics(type, params);
  }

  async createTopic(topicData: { peerId: string }): Promise<Topic> {
    return this.topic.createTopic(topicData);
  }

  async deleteTopic(topicId: string): Promise<void> {
    return this.topic.deleteTopic(topicId);
  }

  async togglePinTopic(topicId: string): Promise<TopicSetting> {
    return this.topic.togglePinTopic(topicId);
  }

  async toggleMuteTopic(
    topicId: string,
    userId: string
  ): Promise<TopicSetting> {
    return this.topic.toggleMuteTopic(topicId, userId);
  }

  async muteTopic(topicId: string, userId: string): Promise<TopicSetting> {
    return this.topic.muteTopic(topicId, userId);
  }

  async unmuteTopic(topicId: string, userId: string): Promise<TopicSetting> {
    return this.topic.unmuteTopic(topicId, userId);
  }

  async getTopicSettings(
    topicId: string,
    userId: string
  ): Promise<TopicSetting> {
    return this.topic.getTopicSettings(topicId, userId);
  }

  async updateTopicSettings(
    topicId: string,
    userId: string,
    settings: Partial<TopicSetting>
  ): Promise<TopicSetting> {
    return this.topic.updateTopicSettings(topicId, userId, settings);
  }

  async leaveTopic(topicId: string): Promise<void> {
    return this.topic.leaveTopic(topicId);
  }

  async getTopicById(topicId: string): Promise<Topic> {
    return this.topic.getTopicById(topicId);
  }

  async getTopicParticipants(topicId: string): Promise<User[]> {
    return this.topic.getTopicParticipants(topicId);
  }

  async createDMWithUser(peerId: string): Promise<Topic> {
    return this.topic.createDMWithUser(peerId);
  }

  async updateTopic(
    topicId: string,
    topicData: Partial<{
      title?: string;
      description?: string;
      avatarUrl?: string;
    }>
  ): Promise<Topic> {
    return this.topic.updateTopic(topicId, topicData);
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
    return this.group.createGroup(groupData);
  }

  async deleteGroup(groupId: string): Promise<void> {
    return this.group.deleteGroup(groupId);
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
    return this.group.updateGroup(groupId, groupData);
  }

  async leaveGroup(groupId: string): Promise<void> {
    return this.group.leaveGroup(groupId);
  }

  async getGroupMembers(
    groupId: string,
    params?: SearchParams
  ): Promise<PaginatedResponse<User>> {
    return this.group.getGroupMembers(groupId, params);
  }

  async addGroupMembers(
    groupId: string,
    userIds: string[]
  ): Promise<{ success: boolean; addedMembers: User[] }> {
    return this.group.addGroupMembers(groupId, userIds);
  }

  async removeGroupMember(
    groupId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    return this.group.removeGroupMember(groupId, userId);
  }

  async promoteToAdmin(
    groupId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    return this.group.promoteToAdmin(groupId, userId);
  }

  async demoteFromAdmin(
    groupId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    return this.group.demoteFromAdmin(groupId, userId);
  }

  async addUsersToGroup(
    groupId: string,
    userIds: string[]
  ): Promise<{ success: boolean; addedMembers: User[] }> {
    return this.group.addUsersToGroup(groupId, userIds);
  }

  async removeUserFromGroup(
    groupId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    return this.group.removeUserFromGroup(groupId, userId);
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
    return this.group.editGroup(groupId, groupData);
  }

  async getMessages(): Promise<Message[]> {
    return [];
  }

  async editMessage(
    topicId: string,
    messageId: string,
    content: string
  ): Promise<Message> {
    return this.message.editMessage(topicId, messageId, content);
  }

  async deleteMessage(topicId: string, messageId: string): Promise<void> {
    return this.message.deleteMessage(topicId, messageId);
  }

  async toggleMessageReaction(
    topicId: string,
    messageId: string,
    emoji: string
  ): Promise<{ success: boolean }> {
    return this.message.toggleMessageReaction(topicId, messageId, emoji);
  }

  async toggleMessagePin(
    topicId: string,
    messageId: string
  ): Promise<{ success: boolean }> {
    return this.message.toggleMessagePin(topicId, messageId);
  }

  async markMessagesAsRead(
    topicId: string,
    messageIds: string[]
  ): Promise<{ success: boolean }> {
    return this.message.markMessagesAsRead(topicId, messageIds);
  }

  async uploadMedia(
    file: File,
    topicId: string,
    messageId?: string
  ): Promise<Media> {
    return this.message.uploadMedia(file, topicId, messageId);
  }

  async uploadFile(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);

    const response = (await this.reqi.post<Media>('/media/upload', formData, {
      parsed: false
    })) as any;
    const data = await response.json();
    return data.url;
  }

  async updateMessageStatus(
    messageId: string,
    status: MessageStatus
  ): Promise<{ success: boolean }> {
    return this.message.updateMessageStatus(messageId, status);
  }

  private getMediaType(mimeType: string): MediaTypeType | null {
    if (mimeType.startsWith('image/')) {
      return MediaType.Image;
    } else if (mimeType.startsWith('video/')) {
      return MediaType.Video;
    } else if (mimeType.startsWith('audio/')) {
      return null;
    } else {
      return MediaType.File;
    }
  }

  async searchMessages(
    query: string,
    params?: SearchParams
  ): Promise<PaginatedResponse<Message & { topic: Topic }>> {
    return this.utils.searchMessages(query, params);
  }

  async searchTopics(
    query: string,
    params?: SearchParams
  ): Promise<PaginatedResponse<Topic>> {
    return this.utils.searchTopics(query, params);
  }

  async getUnreadCounts(): Promise<{
    totalUnread: number;
    topicsUnread: { [topicId: string]: number };
  }> {
    return this.utils.getUnreadCounts();
  }
}
