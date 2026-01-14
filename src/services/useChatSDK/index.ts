import {
  User,
  Topic,
  Group,
  Message,
  TopicSetting,
  Media
} from '@pksep/zod-shared-chat';

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
    if (params?.page !== undefined && params?.page !== null)
      queryParams.append('page', params.page.toString());
    if (params?.limit !== undefined && params?.limit !== null)
      queryParams.append('limit', params.limit.toString());

    const queryString = queryParams.toString();
    const endpoint = `/users${queryString ? `?${queryString}` : ''}`;

    try {
      const response = (await this.reqi.get<PaginatedResponse<User>>(endpoint, {
        parsed: false
      })) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(`Failed to fetch users: ${(error as Error).message}`);
    }
  }

  async createUser(userData: Partial<User>): Promise<User> {
    try {
      const response = (await this.reqi.post<User>('/users', userData, {
        parsed: false
      })) as any;
      const data = await response.json();
      return data;
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
        parsed: false
      })) as any;
      const result = await response.json();

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
    if (params?.page !== undefined && params?.page !== null)
      queryParams.append('page', params.page.toString());
    if (params?.limit !== undefined && params?.limit !== null)
      queryParams.append('limit', params.limit.toString());

    const queryString = queryParams.toString();
    const endpoint = `/topics${queryString ? `?${queryString}` : ''}`;

    try {
      const response = (await this.reqi.get<
        PaginatedResponse<Topic & { lastMessage?: Message }>
      >(endpoint, { parsed: false })) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(`Failed to fetch topics: ${(error as Error).message}`);
    }
  }

  async createTopic(topicData: { peerId: string }): Promise<Topic> {
    try {
      const response = (await this.reqi.post<Topic>('/topics', topicData, {
        parsed: false
      })) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(`Failed to create topic: ${(error as Error).message}`);
    }
  }

  async deleteTopic(topicId: string): Promise<void> {
    try {
      const response = await this.reqi.delete(`/topics/${topicId}`, {
        parsed: false
      });
      await response.json();
    } catch (error) {
      throw new Error(`Failed to delete topic: ${(error as Error).message}`);
    }
  }

  async togglePinTopic(topicId: string, userId: string): Promise<TopicSetting> {
    try {
      const response = (await this.reqi.patch<TopicSetting>(
        `/topics/${topicId}/pin`,
        { userId },
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data;
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
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data;
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
    memberIds: string[];
    admins: string[];
  }): Promise<Group> {
    try {
      const response = (await this.reqi.post<Group>('/groups', groupData, {
        parsed: false
      })) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(`Failed to create group: ${(error as Error).message}`);
    }
  }

  async deleteGroup(groupId: string): Promise<void> {
    try {
      const response = await this.reqi.delete(`/groups/${groupId}`, {
        parsed: false
      });
      await response.json();
    } catch (error) {
      throw new Error(`Failed to delete group: ${(error as Error).message}`);
    }
  }

  async getGroup(groupId: string, params?: SearchParams): Promise<Group> {
    const queryParams = new URLSearchParams();

    if (params?.search) queryParams.append('search', params.search);
    if (params?.page !== undefined && params?.page !== null)
      queryParams.append('page', params.page.toString());
    if (params?.limit !== undefined && params?.limit !== null)
      queryParams.append('limit', params.limit.toString());

    const queryString = queryParams.toString();
    const endpoint = `/groups/${groupId}${queryString ? `?${queryString}` : ''}`;

    try {
      const response = (await this.reqi.get<Group>(endpoint, {
        parsed: false
      })) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(`Failed to fetch group: ${(error as Error).message}`);
    }
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
    try {
      const response = (await this.reqi.patch<Group>(
        `/groups/${groupId}`,
        groupData,
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(`Failed to update group: ${(error as Error).message}`);
    }
  }

  async leaveGroup(groupId: string): Promise<void> {
    try {
      const response = await this.reqi.delete(`/groups/${groupId}/leave`, {
        parsed: false
      });
      await response.json();
    } catch (error) {
      throw new Error(`Failed to leave group: ${(error as Error).message}`);
    }
  }

  async getGroupMembers(
    groupId: string,
    params?: SearchParams
  ): Promise<PaginatedResponse<User>> {
    const queryParams = new URLSearchParams();

    if (params?.search) queryParams.append('search', params.search);
    if (params?.page !== undefined && params?.page !== null)
      queryParams.append('page', params.page.toString());
    if (params?.limit !== undefined && params?.limit !== null)
      queryParams.append('limit', params.limit.toString());

    const queryString = queryParams.toString();
    const endpoint = `/groups/${groupId}/members${
      queryString ? `?${queryString}` : ''
    }`;

    try {
      const response = (await this.reqi.get<PaginatedResponse<User>>(endpoint, {
        parsed: false
      })) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(
        `Failed to fetch group members: ${(error as Error).message}`
      );
    }
  }

  async addGroupMembers(
    groupId: string,
    userIds: string[]
  ): Promise<{ success: boolean; addedMembers: User[] }> {
    try {
      const response = (await this.reqi.post(
        `/groups/${groupId}/members`,
        { userIds },
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(
        `Failed to add members to group: ${(error as Error).message}`
      );
    }
  }

  async removeGroupMember(
    groupId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    try {
      const response = (await this.reqi.delete(
        `/groups/${groupId}/members/${userId}`,
        {
          parsed: false
        }
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(
        `Failed to remove member from group: ${(error as Error).message}`
      );
    }
  }

  async promoteToAdmin(
    groupId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    try {
      const response = (await this.reqi.patch(
        `/groups/${groupId}/admins/${userId}`,
        {},
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(
        `Failed to promote user to admin: ${(error as Error).message}`
      );
    }
  }

  async demoteFromAdmin(
    groupId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    try {
      const response = (await this.reqi.delete(
        `/groups/${groupId}/admins/${userId}`,
        {
          parsed: false
        }
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(
        `Failed to demote user from admin: ${(error as Error).message}`
      );
    }
  }

  async getMessages(
    topicId: string,
    params?: SearchParams
  ): Promise<PaginatedResponse<Message>> {
    const queryParams = new URLSearchParams();

    if (params?.search) queryParams.append('search', params.search);
    if (params?.page !== undefined && params?.page !== null)
      queryParams.append('page', params.page.toString());
    if (params?.limit !== undefined && params?.limit !== null)
      queryParams.append('limit', params.limit.toString());

    const queryString = queryParams.toString();
    const endpoint = `/topics/${topicId}/messages${
      queryString ? `?${queryString}` : ''
    }`;

    try {
      const response = (await this.reqi.get<PaginatedResponse<Message>>(
        endpoint,
        {
          parsed: false
        }
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(`Failed to fetch messages: ${(error as Error).message}`);
    }
  }

  async sendMessage(
    topicId: string,
    messageData: {
      content: string;
      replyTo?: string;
      attachments?: Media[];
    }
  ): Promise<Message> {
    try {
      const response = (await this.reqi.post<Message>(
        `/topics/${topicId}/messages`,
        messageData,
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(`Failed to send message: ${(error as Error).message}`);
    }
  }

  async editMessage(
    topicId: string,
    messageId: string,
    content: string
  ): Promise<Message> {
    try {
      const response = (await this.reqi.patch<Message>(
        `/topics/${topicId}/messages/${messageId}`,
        { content },
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(`Failed to edit message: ${(error as Error).message}`);
    }
  }

  async deleteMessage(topicId: string, messageId: string): Promise<void> {
    try {
      const response = await this.reqi.delete(
        `/topics/${topicId}/messages/${messageId}`,
        {
          parsed: false
        }
      );
      await response.json();
    } catch (error) {
      throw new Error(`Failed to delete message: ${(error as Error).message}`);
    }
  }

  async toggleMessageReaction(
    topicId: string,
    messageId: string,
    emoji: string
  ): Promise<{ success: boolean }> {
    try {
      const response = (await this.reqi.post(
        `/topics/${topicId}/messages/${messageId}/reactions`,
        { emoji },
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(`Failed to toggle reaction: ${(error as Error).message}`);
    }
  }

  async toggleMessagePin(
    topicId: string,
    messageId: string
  ): Promise<{ success: boolean }> {
    try {
      const response = (await this.reqi.post(
        `/topics/${topicId}/messages/${messageId}/pin`,
        {},
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(`Failed to toggle pin: ${(error as Error).message}`);
    }
  }

  async markMessagesAsRead(
    topicId: string,
    messageIds: string[]
  ): Promise<{ success: boolean }> {
    try {
      const response = (await this.reqi.post(
        `/topics/${topicId}/messages/read`,
        { messageIds },
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(
        `Failed to mark messages as read: ${(error as Error).message}`
      );
    }
  }

  async uploadMedia(file: File, topicId: string): Promise<Media> {
    if (!this.s3Service) {
      throw new Error('S3 service not initialized');
    }

    try {
      // Upload to S3 first
      const uploadResult = await this.s3Service.uploadFile(file);

      // Then create media record in the database
      const mediaData: Media = {
        id: '',
        url: uploadResult.url,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        mediaType: this.getMediaType(file.type),
        topicId,
        uploadedAt: new Date().toISOString(),
        uploadedBy: ''
      };

      const response = (await this.reqi.post<Media>('/media', mediaData, {
        parsed: false
      })) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(`Failed to upload media: ${(error as Error).message}`);
    }
  }

  private getMediaType(mimeType: string): MediaTypeType {
    if (mimeType.startsWith('image/')) {
      return MediaTypeType.Image;
    } else if (mimeType.startsWith('video/')) {
      return MediaTypeType.Video;
    } else if (mimeType.startsWith('audio/')) {
      return MediaTypeType.Audio;
    } else {
      return MediaTypeType.Document;
    }
  }

  async searchMessages(
    query: string,
    params?: SearchParams
  ): Promise<PaginatedResponse<Message & { topic: Topic }>> {
    const queryParams = new URLSearchParams();

    queryParams.append('query', query);
    if (params?.page !== undefined && params?.page !== null)
      queryParams.append('page', params.page.toString());
    if (params?.limit !== undefined && params?.limit !== null)
      queryParams.append('limit', params.limit.toString());

    const queryString = queryParams.toString();
    const endpoint = `/search/messages${queryString ? `?${queryString}` : ''}`;

    try {
      const response = (await this.reqi.get<
        PaginatedResponse<Message & { topic: Topic }>
      >(endpoint, { parsed: false })) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(`Failed to search messages: ${(error as Error).message}`);
    }
  }

  async searchTopics(
    query: string,
    params?: SearchParams
  ): Promise<PaginatedResponse<Topic>> {
    const queryParams = new URLSearchParams();

    queryParams.append('query', query);
    if (params?.page !== undefined && params?.page !== null)
      queryParams.append('page', params.page.toString());
    if (params?.limit !== undefined && params?.limit !== null)
      queryParams.append('limit', params.limit.toString());

    const queryString = queryParams.toString();
    const endpoint = `/search/topics${queryString ? `?${queryString}` : ''}`;

    try {
      const response = (await this.reqi.get<PaginatedResponse<Topic>>(
        endpoint,
        {
          parsed: false
        }
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(`Failed to search topics: ${(error as Error).message}`);
    }
  }

  async getUnreadCounts(): Promise<{
    totalUnread: number;
    topicsUnread: { [topicId: string]: number };
  }> {
    try {
      const response = (await this.reqi.get('/unread-counts', {
        parsed: false
      })) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(
        `Failed to fetch unread counts: ${(error as Error).message}`
      );
    }
  }

  async getTopicSettings(
    topicId: string,
    userId: string
  ): Promise<TopicSetting> {
    try {
      const response = (await this.reqi.get<TopicSetting>(
        `/topics/${topicId}/settings/${userId}`,
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(
        `Failed to fetch topic settings: ${(error as Error).message}`
      );
    }
  }

  async updateTopicSettings(
    topicId: string,
    userId: string,
    settings: Partial<TopicSetting>
  ): Promise<TopicSetting> {
    try {
      const response = (await this.reqi.patch<TopicSetting>(
        `/topics/${topicId}/settings/${userId}`,
        settings,
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(
        `Failed to update topic settings: ${(error as Error).message}`
      );
    }
  }

  async joinTopic(topicId: string): Promise<{ success: boolean }> {
    try {
      const response = (await this.reqi.post(
        `/topics/${topicId}/join`,
        {},
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(`Failed to join topic: ${(error as Error).message}`);
    }
  }

  async leaveTopic(topicId: string): Promise<void> {
    try {
      const response = await this.reqi.delete(`/topics/${topicId}/leave`, {
        parsed: false
      });
      await response.json();
    } catch (error) {
      throw new Error(`Failed to leave topic: ${(error as Error).message}`);
    }
  }

  async getUserProfile(userId: string): Promise<User> {
    try {
      const response = (await this.reqi.get<User>(`/users/${userId}`, {
        parsed: false
      })) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(
        `Failed to fetch user profile: ${(error as Error).message}`
      );
    }
  }

  async updateUserProfile(
    userId: string,
    profileData: Partial<User>
  ): Promise<User> {
    try {
      const response = (await this.reqi.patch<User>(
        `/users/${userId}`,
        profileData,
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(
        `Failed to update user profile: ${(error as Error).message}`
      );
    }
  }

  async getRecentTopics(userId: string): Promise<Topic[]> {
    try {
      const response = (await this.reqi.get<Topic[]>(
        `/users/${userId}/recent-topics`,
        {
          parsed: false
        }
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(
        `Failed to fetch recent topics: ${(error as Error).message}`
      );
    }
  }

  async getTopicById(topicId: string): Promise<Topic> {
    try {
      const response = (await this.reqi.get<Topic>(`/topics/${topicId}`, {
        parsed: false
      })) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(`Failed to fetch topic: ${(error as Error).message}`);
    }
  }

  async getTopicParticipants(topicId: string): Promise<User[]> {
    try {
      const response = (await this.reqi.get<User[]>(
        `/topics/${topicId}/participants`,
        {
          parsed: false
        }
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(
        `Failed to fetch topic participants: ${(error as Error).message}`
      );
    }
  }

  async createDMWithUser(peerId: string): Promise<Topic> {
    try {
      const response = (await this.reqi.post<Topic>(
        '/topics/dm',
        { peerId },
        {
          parsed: false
        }
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(`Failed to create DM: ${(error as Error).message}`);
    }
  }

  async updateTopic(
    topicId: string,
    topicData: Partial<{
      title?: string;
      description?: string;
      avatarUrl?: string;
    }>
  ): Promise<Topic> {
    try {
      const response = (await this.reqi.patch<Topic>(
        `/topics/${topicId}`,
        topicData,
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(`Failed to update topic: ${(error as Error).message}`);
    }
  }
}
