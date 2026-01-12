import {
  User,
  Topic,
  Group,
  Message,
  Reaction,
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

export interface ChatSDKOptions {
  apiUrl: string;
  wsUrl: string;
  token?: string;
}

export interface WebSocketEvent {
  type: string;
  payload: any;
}

export class ChatSDK {
  private apiUrl: string;
  private wsUrl: string;
  private token?: string;
  private wsConnection: WebSocket | null = null;
  private eventHandlers: Map<string, Array<(event: WebSocketEvent) => void>> = new Map();
  private s3Service?: S3Service;
  private reqi: Reqi;

  constructor(options: ChatSDKOptions, s3Config?: S3Config) {
    this.apiUrl = options.apiUrl;
    this.wsUrl = options.wsUrl;
    this.token = options.token;

    this.reqi = new Reqi(this.apiUrl, {
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
    });

    if (s3Config) {
      this.s3Service = new S3Service(s3Config);
    }
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wsConnection = new WebSocket(this.wsUrl);

        this.wsConnection.onopen = () => {
          console.log('Connected to chat server');

          if (this.token) {
            this.authenticate(this.token);
          }

          resolve();
        };

        this.wsConnection.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        this.wsConnection.onclose = () => {
          console.log('Disconnected from chat server');
        };

        this.wsConnection.onmessage = (event) => {
          const message: WebSocketEvent = JSON.parse(event.data as string);
          this.handleWebSocketEvent(message);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
  }

  private authenticate(token: string): void {
    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      this.wsConnection.send(JSON.stringify({
        type: 'AUTHENTICATE',
        payload: { token }
      }));
    }
  }

  private handleWebSocketEvent(rawEvent: any): void {
    const event: WebSocketEvent = {
      type: rawEvent.type,
      payload: rawEvent.payload,
      timestamp: new Date(rawEvent.timestamp || Date.now()),
    };

    if (Object.values(WebSocketEventType).includes(event.type)) {
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
      const handlers = this.eventHandlers.get(type) as WebSocketEventHandler<T>[];
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
    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      this.wsConnection.send(JSON.stringify({
        type,
        payload,
        timestamp: new Date().toISOString()
      }));
    } else {
      console.warn('WebSocket is not connected. Cannot send event:', type);
    }
  }

  async getUsers(params?: SearchParams): Promise<PaginatedResponse<User>> {
    const queryParams = new URLSearchParams();

    if (params?.search) queryParams.append('search', params.search);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    const queryString = queryParams.toString();
    const endpoint = `/users${queryString ? `?${queryString}` : ''}`;

    const response = await this.reqi.get<PaginatedResponse<User>>(endpoint, { parsed: true });
    return response.data;
  }

  async createUser(userData: Partial<User>): Promise<User> {
    const response = await this.reqi.post<User>('/users', userData, { parsed: true });
    return response.data;
  }

  async authenticateUser(credentials: { email: string; password: string }): Promise<{ user: User; token: string }> {
    const response = await this.reqi.post('/auth/login', credentials, { parsed: true });
    const result = response.data;

    this.token = result.token;

    this.reqi = new Reqi(this.apiUrl, {
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
    });

    return result;
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

    const response = await this.reqi.get<PaginatedResponse<Topic & { lastMessage?: Message }>>(endpoint, { parsed: true });
    return response.data;
  }

  async createTopic(topicData: { type: TopicType; title?: string }): Promise<Topic> {
    const response = await this.reqi.post<Topic>('/topics', topicData, { parsed: true });
    return response.data;
  }

  async deleteTopic(topicId: string): Promise<void> {
    await this.reqi.delete(`/topics/${topicId}`, { parsed: true });
  }

  async pinTopic(topicId: string, userId: string): Promise<TopicSetting> {
    const response = await this.reqi.post<TopicSetting>(`/topics/${topicId}/pin`, { userId }, { parsed: true });
    return response.data;
  }

  async unpinTopic(topicId: string, userId: string): Promise<void> {
    await this.reqi.delete(`/topics/${topicId}/pin`, {
      parsed: true,
      request: {
        body: { userId }
      }
    });
  }

  async muteTopic(topicId: string, userId: string): Promise<TopicSetting> {
    const response = await this.reqi.post<TopicSetting>(`/topics/${topicId}/mute`, { userId }, { parsed: true });
    return response.data;
  }

  async unmuteTopic(topicId: string, userId: string): Promise<void> {
    await this.reqi.delete(`/topics/${topicId}/mute`, {
      parsed: true,
      request: {
        body: { userId }
      }
    });
  }

  async createGroup(groupData: {
    title: string;
    description?: string;
    avatarUrl?: string;
    members: string[];
    admins: string[];
  }): Promise<Group> {
    const response = await this.reqi.post<Group>('/groups', groupData, { parsed: true });
    return response.data;
  }

  async deleteGroup(groupId: string): Promise<void> {
    await this.reqi.delete(`/groups/${groupId}`, { parsed: true });
  }

  async getGroup(groupId: string, params?: SearchParams): Promise<Group> {
    const queryParams = new URLSearchParams();

    if (params?.search) queryParams.append('search', params.search);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    const queryString = queryParams.toString();
    const endpoint = `/groups/${groupId}${queryString ? `?${queryString}` : ''}`;

    const response = await this.reqi.get<Group>(endpoint, { parsed: true });
    return response.data;
  }

  async editGroup(
    groupId: string,
    updateData: {
      title?: string;
      description?: string;
      avatarUrl?: string
    }
  ): Promise<Group> {
    const response = await this.reqi.patch<Group>(`/groups/${groupId}`, updateData, { parsed: true });
    return response.data;
  }

  async addUsersToGroup(groupId: string, userIds: string[]): Promise<Group> {
    const response = await this.reqi.post<Group>(`/groups/${groupId}/members`, { userIds }, { parsed: true });
    return response.data;
  }

  async removeUsersFromGroup(groupId: string, userIds: string[]): Promise<Group> {
    const response = await this.reqi.delete<Group>(`/groups/${groupId}/members`, {
      parsed: true,
      request: {
        body: { userIds }
      }
    });
    return response.data;
  }

  async leaveGroup(userId: string, groupId: string): Promise<void> {
    await this.reqi.post(`/groups/${groupId}/leave`, { userId }, { parsed: true });
  }

  async sendMessage(messageData: {
    topicId: string;
    text?: string;
    media?: Media[];
    replayMessageId?: string;
  }): Promise<Message> {
    const messageToSend: Partial<Message> = {
      topicId: messageData.topicId,
      text: messageData.text,
      media: messageData.media || [],
      replayMessageId: messageData.replayMessageId,
      status: MessageStatus.Wait,
    };

    const response = await this.reqi.post<Message>('/messages', messageToSend, { parsed: true });
    return response.data;
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

    const response = await this.reqi.get<PaginatedResponse<Message>>(endpoint, { parsed: true });
    return response.data;
  }

  async editMessage(
    messageId: string,
    newText: string
  ): Promise<Message> {
    const response = await this.reqi.patch<Message>(`/messages/${messageId}`, {
      text: newText,
      isEdit: true
    }, { parsed: true });
    const updatedMessage = response.data;

    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      this.wsConnection.send(JSON.stringify({
        type: 'MESSAGE_EDITED',
        payload: updatedMessage
      }));
    }

    return updatedMessage;
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.reqi.delete(`/messages/${messageId}`, { parsed: true });

    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      this.wsConnection.send(JSON.stringify({
        type: 'MESSAGE_DELETED',
        payload: { messageId }
      }));
    }
  }

  async addReaction(reactionData: {
    messageId: string;
    text: string;
    senderUser: string;
  }): Promise<Reaction> {
    const response = await this.reqi.post<Reaction>('/reactions', reactionData, { parsed: true });
    const reaction = response.data;

    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      this.wsConnection.send(JSON.stringify({
        type: 'REACTION_ADDED',
        payload: reaction
      }));
    }

    return reaction;
  }

  async removeReaction(reactionId: string): Promise<void> {
    await this.reqi.delete(`/reactions/${reactionId}`, { parsed: true });

    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      this.wsConnection.send(JSON.stringify({
        type: 'REACTION_REMOVED',
        payload: { reactionId }
      }));
    }
  }

  async pinMessage(messageId: string): Promise<Message> {
    const response = await this.reqi.post<Message>(`/messages/${messageId}/pin`, {}, { parsed: true });
    const pinnedMessage = response.data;

    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      this.wsConnection.send(JSON.stringify({
        type: 'MESSAGE_PINNED',
        payload: pinnedMessage
      }));
    }

    return pinnedMessage;
  }

  async unpinMessage(messageId: string): Promise<Message> {
    const response = await this.reqi.delete<Message>(`/messages/${messageId}/pin`, { parsed: true });
    const unpinnedMessage = response.data;

    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      this.wsConnection.send(JSON.stringify({
        type: 'MESSAGE_UNPINNED',
        payload: unpinnedMessage
      }));
    }

    return unpinnedMessage;
  }

  async updateMessageStatus(
    messageId: string,
    status: MessageStatus
  ): Promise<Message> {
    const response = await this.reqi.patch<Message>(`/messages/${messageId}/status`, { status }, { parsed: true });
    return response.data;
  }

  async uploadMedia(file: File | Blob, topicId: string, messageId?: string): Promise<Media> {
    if (!this.s3Service) {
      throw new Error('S3 service not configured. Please provide S3 configuration when initializing ChatSDK.');
    }

    const uploadResult = await this.s3Service.uploadFile(file);

    const mediaData: Omit<Media, 'createdAt' | 'updatedAt'> = {
      id: uploadResult.id,
      path: uploadResult.path,
      messageId: messageId || '',
      type: this.getMediaType(file),
    };

    const response = await this.reqi.post<Media>('/media', mediaData, { parsed: true });
    const media = response.data;

    if (messageId) {
      await this.updateMessageWithMedia(messageId, media);
    }

    return media;
  }

  async deleteMedia(mediaId: string, mediaPath: string): Promise<void> {
    if (!this.s3Service) {
      throw new Error('S3 service not configured. Please provide S3 configuration when initializing ChatSDK.');
    }

    await this.s3Service.deleteFile(mediaId, mediaPath);

    await this.reqi.delete(`/media/${mediaId}`, { parsed: true });
  }

  private async updateMessageWithMedia(messageId: string, media: Media): Promise<Message> {
    const response = await this.reqi.get<Message>(`/messages/${messageId}`, { parsed: true });
    const message = response.data;

    const updatedMediaList = [...message.media, media];

    const patchResponse = await this.reqi.patch<Message>(`/messages/${messageId}`, {
      media: updatedMediaList
    }, { parsed: true });
    return patchResponse.data;
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
