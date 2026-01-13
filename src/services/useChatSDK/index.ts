import {
  User,
  Topic,
  Group,
  Message,
  TopicSetting,
  Media,
  TopicType,
  MessageStatus,
  PaginatedResponse,
  SearchParams,
  MediaType
} from './types';
import { S3Service, S3Config } from './s3Service';
import {
  WebSocketEventType,
  WebSocketEventHandler,
  WebSocketEventPayloads
} from './websocketEvents';
import { Reqi } from '@pksep/reqi';
import io, { Socket } from 'socket.io-client';

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
  private eventHandlers: Map<string, Array<(event: WebSocketEvent) => void>> =
    new Map();
  private s3Service?: S3Service;
  private reqi: Reqi;

  constructor(options: ChatSDKOptions, s3Config?: S3Config) {
    this.apiUrl = options.apiUrl;
    this.wsUrl = options.wsUrl;
    this.token = options.token;

    this.reqi = new Reqi(this.apiUrl, {
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      }
    });

    if (s3Config) {
      this.s3Service = new S3Service(s3Config);
    }
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
          }
        });

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

        // Listen to server WebSocket events and map them to our event types
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

        // Also listen for generic events if needed
        this.socket.onAny((event, ...args) => {
          // Handle any other events that might come from the server
          // Map server events to our internal event types if needed
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
              // Check if the event type exists in our enum
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
    const eventType = rawEvent.type as WebSocketEventType;
    const event: WebSocketEvent = {
      type: eventType,
      payload: rawEvent.payload,
      timestamp: new Date(rawEvent.timestamp || Date.now())
    };

    if (
      Object.values(WebSocketEventType).includes(
        event.type as WebSocketEventType
      )
    ) {
      const handlers = this.eventHandlers.get(event.type) || [];
      handlers.forEach(handler => handler(event));
    } else {
      console.warn(`Unknown WebSocket event type: ${event.type}`);
    }
  }

  subscribeToEvent<T extends WebSocketEventType>(
    type: T,
    handler: WebSocketEventHandler<T>
  ): void {
    if (!this.eventHandlers.has(type)) {
      this.eventHandlers.set(type, []);
    }

    const handlers = this.eventHandlers.get(type) as WebSocketEventHandler<T>[];
    handlers.push(handler as WebSocketEventHandler<any>);
  }

  unsubscribeFromEvent<T extends WebSocketEventType>(
    type: T,
    handler: WebSocketEventHandler<T>
  ): void {
    if (this.eventHandlers.has(type)) {
      const handlers = this.eventHandlers.get(
        type
      ) as WebSocketEventHandler<T>[];
      const index = handlers.indexOf(handler as WebSocketEventHandler<any>);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  sendWebSocketEvent<T extends WebSocketEventType>(
    type: T,
    payload: WebSocketEventPayloads[T]
  ): void {
    if (this.socket && this.socket.connected) {
      // Map our internal event types to server's expected event types
      let serverEventType: string = type;

      switch (type) {
        case WebSocketEventType.SEND_MESSAGE:
          serverEventType = 'sendMessage';
          break;
        case WebSocketEventType.EDIT_MESSAGE:
          serverEventType = 'editMessage';
          break;
        case WebSocketEventType.DELETE_MESSAGE:
          serverEventType = 'deleteMessage';
          break;
        case WebSocketEventType.TOGGLE_REACTION:
          serverEventType = 'toggleReaction';
          break;
        case WebSocketEventType.TOGGLE_PIN:
          serverEventType = 'togglePin';
          break;
        case WebSocketEventType.READ_MESSAGES:
          serverEventType = 'readMessages';
          break;
        case WebSocketEventType.JOIN_TOPIC:
          serverEventType = 'joinTopic';
          break;
        case WebSocketEventType.LEAVE_TOPIC:
          serverEventType = 'leaveTopic';
          break;
        default:
          serverEventType = type;
          break;
      }

      // Emit the event to the server using Socket.IO
      this.socket.emit(serverEventType, payload);
    } else {
      console.warn('Socket.IO is not connected. Cannot send event:', type);
    }
  }

  async getUsers(params?: SearchParams): Promise<PaginatedResponse<User>> {
    const queryParams = new URLSearchParams();

    if (params?.search) queryParams.append('search', params.search);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    const queryString = queryParams.toString();
    const endpoint = `/users${queryString ? `?${queryString}` : ''}`;

    try {
      const response = (await this.reqi.get<PaginatedResponse<User>>(endpoint, {
        parsed: true
      })) as any;
      return response;
    } catch (error) {
      throw new Error(`Failed to fetch users: ${(error as Error).message}`);
    }
  }

  async createUser(userData: Partial<User>): Promise<User> {
    try {
      const response = (await this.reqi.post<User>('/users', userData, {
        parsed: true
      })) as any;
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create user: ${(error as Error).message}`);
    }
  }

  async authenticateUser(credentials: {
    email: string;
    password: string;
  }): Promise<{ user: User; token: string }> {
    try {
      const response = (await this.reqi.post('/auth/login', credentials, {
        parsed: true
      })) as any;
      const result = response.data;

      this.token = result.token;

      // Recreate the Reqi instance with the new token
      this.reqi = this.createReqiInstance();

      return result;
    } catch (error) {
      throw new Error(`Authentication failed: ${(error as Error).message}`);
    }
  }

  async getTopics(
    type?: TopicType,
    params?: SearchParams
  ): Promise<PaginatedResponse<Topic & { lastMessage?: Message }>> {
    const queryParams = new URLSearchParams();

    if (type) queryParams.append('type', type);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    const queryString = queryParams.toString();
    const endpoint = `/topics${queryString ? `?${queryString}` : ''}`;

    try {
      const response = (await this.reqi.get<
        PaginatedResponse<Topic & { lastMessage?: Message }>
      >(endpoint, { parsed: true })) as any;
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch topics: ${(error as Error).message}`);
    }
  }

  async createTopic(topicData: {
    type: TopicType;
    title?: string;
  }): Promise<Topic> {
    try {
      const response = (await this.reqi.post<Topic>('/topics', topicData, {
        parsed: true
      })) as any;
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create topic: ${(error as Error).message}`);
    }
  }

  async deleteTopic(topicId: string): Promise<void> {
    try {
      await this.reqi.delete(`/topics/${topicId}`, { parsed: true });
    } catch (error) {
      throw new Error(`Failed to delete topic: ${(error as Error).message}`);
    }
  }

  async togglePinTopic(topicId: string, userId: string): Promise<TopicSetting> {
    try {
      const response = (await this.reqi.patch<TopicSetting>(
        `/topics/${topicId}/pin`,
        { userId },
        { parsed: true }
      )) as any;
      return response.data;
    } catch (error) {
      throw new Error(
        `Failed to toggle pin topic: ${(error as Error).message}`
      );
    }
  }

  async toggleMuteTopic(
    topicId: string,
    userId: string
  ): Promise<TopicSetting> {
    try {
      const response = (await this.reqi.patch<TopicSetting>(
        `/topics/${topicId}/mute`,
        { userId },
        { parsed: true }
      )) as any;
      return response.data;
    } catch (error) {
      throw new Error(
        `Failed to toggle mute topic: ${(error as Error).message}`
      );
    }
  }

  async muteTopic(topicId: string, userId: string): Promise<TopicSetting> {
    return this.toggleMuteTopic(topicId, userId);
  }

  async unmuteTopic(topicId: string, userId: string): Promise<TopicSetting> {
    return this.toggleMuteTopic(topicId, userId);
  }

  async createGroup(groupData: {
    title: string;
    description?: string;
    avatarUrl?: string;
    members: string[];
    admins: string[];
  }): Promise<Group> {
    try {
      const response = (await this.reqi.post<Group>('/groups', groupData, {
        parsed: true
      })) as any;
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create group: ${(error as Error).message}`);
    }
  }

  async deleteGroup(groupId: string): Promise<void> {
    try {
      await this.reqi.delete(`/groups/${groupId}`, { parsed: true });
    } catch (error) {
      throw new Error(`Failed to delete group: ${(error as Error).message}`);
    }
  }

  async getGroup(groupId: string, params?: SearchParams): Promise<Group> {
    const queryParams = new URLSearchParams();

    if (params?.search) queryParams.append('search', params.search);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    const queryString = queryParams.toString();
    const endpoint = `/groups/${groupId}${queryString ? `?${queryString}` : ''}`;

    try {
      const response = (await this.reqi.get<Group>(endpoint, {
        parsed: true
      })) as any;
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch group: ${(error as Error).message}`);
    }
  }

  async editGroup(
    groupId: string,
    updateData: {
      title?: string;
      description?: string;
      avatarUrl?: string;
    }
  ): Promise<Group> {
    try {
      const response = (await this.reqi.patch<Group>(
        `/groups/${groupId}`,
        updateData,
        { parsed: true }
      )) as any;
      return response.data;
    } catch (error) {
      throw new Error(`Failed to edit group: ${(error as Error).message}`);
    }
  }

  async addUsersToGroup(groupId: string, userIds: string[]): Promise<Group> {
    try {
      const response = (await this.reqi.post<Group>(
        `/groups/${groupId}/members`,
        { userIds },
        { parsed: true }
      )) as any;
      return response.data;
    } catch (error) {
      throw new Error(
        `Failed to add users to group: ${(error as Error).message}`
      );
    }
  }

  async removeUserFromGroup(groupId: string, userId: string): Promise<void> {
    try {
      await this.reqi.delete(`/groups/${groupId}/members/${userId}`, {
        parsed: true
      });
    } catch (error) {
      throw new Error(
        `Failed to remove user from group: ${(error as Error).message}`
      );
    }
  }

  async leaveGroup(userId: string, groupId: string): Promise<void> {
    try {
      await this.reqi.post(
        `/groups/${groupId}/leave`,
        { userId },
        { parsed: true }
      );
    } catch (error) {
      throw new Error(`Failed to leave group: ${(error as Error).message}`);
    }
  }

  async sendMessage(messageData: {
    topicId: string;
    text?: string;
    media?: Media[];
    replayMessageId?: string;
  }): Promise<Message> {
    if (this.socket && this.socket.connected) {
      this.sendWebSocketEvent(WebSocketEventType.SEND_MESSAGE, {
        topicId: messageData.topicId,
        text: messageData.text,
        media: messageData.media || [],
        replayMessageId: messageData.replayMessageId
      });

      // Return a temporary message object that will be updated when the server confirms receipt
      return {
        id: `temp-${Date.now()}`,
        senderUser: '', // Will be filled by server
        topicId: messageData.topicId,
        reactions: [],
        text: messageData.text,
        replayMessageId: messageData.replayMessageId,
        media: messageData.media || [],
        isEdit: false,
        status: MessageStatus.Wait,
        isPin: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    } else {
      throw new Error('Socket is not connected');
    }
  }

  async getMessages(
    topicId: string,
    params?: { page?: number; limit?: number; since?: Date }
  ): Promise<PaginatedResponse<Message>> {
    const queryParams = new URLSearchParams();

    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.since) queryParams.append('since', params.since.toISOString());

    const queryString = queryParams.toString();
    const endpoint = `/topics/${topicId}/messages${queryString ? `?${queryString}` : ''}`;

    try {
      const response = (await this.reqi.get<PaginatedResponse<Message>>(
        endpoint,
        { parsed: true }
      )) as any;
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch messages: ${(error as Error).message}`);
    }
  }

  async editMessage(messageId: string, newText: string): Promise<void> {
    if (this.socket && this.socket.connected) {
      this.sendWebSocketEvent(WebSocketEventType.EDIT_MESSAGE, {
        messageId,
        text: newText
      });
    } else {
      throw new Error('Socket is not connected');
    }
  }

  async deleteMessage(messageId: string, topicId: string): Promise<void> {
    if (this.socket && this.socket.connected) {
      this.sendWebSocketEvent(WebSocketEventType.DELETE_MESSAGE, {
        messageId,
        topicId
      });
    } else {
      throw new Error('Socket is not connected');
    }
  }

  async addReaction(reactionData: {
    messageId: string;
    emoji: string;
    topicId: string;
  }): Promise<void> {
    if (this.socket && this.socket.connected) {
      this.sendWebSocketEvent(WebSocketEventType.TOGGLE_REACTION, {
        messageId: reactionData.messageId,
        emoji: reactionData.emoji,
        topicId: reactionData.topicId
      });
    } else {
      throw new Error('Socket is not connected');
    }
  }

  async removeReaction(
    messageId: string,
    emoji: string,
    topicId: string
  ): Promise<void> {
    if (this.socket && this.socket.connected) {
      this.sendWebSocketEvent(WebSocketEventType.TOGGLE_REACTION, {
        messageId,
        emoji,
        topicId
      });
    } else {
      throw new Error('Socket is not connected');
    }
  }

  async togglePinMessage(messageId: string): Promise<void> {
    if (this.socket && this.socket.connected) {
      this.sendWebSocketEvent(WebSocketEventType.TOGGLE_PIN, {
        messageId
      });
    } else {
      throw new Error('Socket is not connected');
    }
  }

  async unpinMessage(messageId: string): Promise<void> {
    if (this.socket && this.socket.connected) {
      this.sendWebSocketEvent(WebSocketEventType.TOGGLE_PIN, {
        messageId
      });
    } else {
      throw new Error('Socket is not connected');
    }
  }

  async markMessagesAsRead(
    messageIds: string[],
    topicId: string
  ): Promise<void> {
    if (this.socket && this.socket.connected) {
      this.sendWebSocketEvent(WebSocketEventType.READ_MESSAGES, {
        messageIds,
        topicId
      });
    } else {
      throw new Error('Socket is not connected');
    }
  }

  async uploadMedia(
    file: File | Blob,
    topicId: string,
    messageId?: string
  ): Promise<Media> {
    if (!this.s3Service) {
      throw new Error(
        'S3 service not configured. Please provide S3 configuration when initializing ChatSDK.'
      );
    }

    const uploadResult = await this.s3Service.uploadFile(file);

    const mediaData: Media = {
      id: uploadResult.id,
      path: uploadResult.path,
      type: this.getMediaType(file),
      messageId: messageId || '',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Media is typically sent as part of a message
    return mediaData;
  }

  async deleteMedia(mediaId: string, mediaPath: string): Promise<void> {
    if (!this.s3Service) {
      throw new Error(
        'S3 service not configured. Please provide S3 configuration when initializing ChatSDK.'
      );
    }

    await this.s3Service.deleteFile(mediaId, mediaPath);
  }

  async joinTopic(topicId: string): Promise<void> {
    if (this.socket && this.socket.connected) {
      this.sendWebSocketEvent(WebSocketEventType.JOIN_TOPIC, {
        topicId
      });
    } else {
      throw new Error('Socket is not connected');
    }
  }

  async leaveTopic(topicId: string): Promise<void> {
    if (this.socket && this.socket.connected) {
      this.sendWebSocketEvent(WebSocketEventType.LEAVE_TOPIC, {
        topicId
      });
    } else {
      throw new Error('Socket is not connected');
    }
  }

  async updateMessageStatus(
    messageId: string,
    status: MessageStatus
  ): Promise<void> {
    try {
      await this.reqi.patch(
        `/messages/${messageId}/status`,
        { status },
        { parsed: true }
      );
    } catch (error) {
      throw new Error(
        `Failed to update message status: ${(error as Error).message}`
      );
    }
  }

  private getMediaType(file: File | Blob): MediaType {
    const mimeType = file.type;

    if (mimeType.startsWith('image/')) {
      return MediaType.Image;
    } else if (mimeType.startsWith('video/')) {
      return MediaType.Video;
    } else {
      return MediaType.File;
    }
  }
}
