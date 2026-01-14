import { Message, Topic, Media } from '@pksep/zod-shared-chat';
import { Reqi } from '@pksep/reqi';
import { SearchParams, PaginatedResponse, MessageStatus } from './types';
import { S3Service } from './s3Service';

export interface ChatMessageInterface {
  editMessage(
    topicId: string,
    messageId: string,
    content: string
  ): Promise<Message>;
  deleteMessage(topicId: string, messageId: string): Promise<void>;
  toggleMessageReaction(
    topicId: string,
    messageId: string,
    emoji: string
  ): Promise<{ success: boolean }>;
  toggleMessagePin(
    topicId: string,
    messageId: string
  ): Promise<{ success: boolean }>;
  markMessagesAsRead(
    topicId: string,
    messageIds: string[]
  ): Promise<{ success: boolean }>;
  uploadMedia(file: File, topicId: string, messageId?: string): Promise<Media>;
  searchMessages(
    query: string,
    params?: SearchParams
  ): Promise<PaginatedResponse<Message & { topic: Topic }>>;
  updateMessageStatus(
    messageId: string,
    status: MessageStatus
  ): Promise<{ success: boolean }>;
}

export class ChatMessage implements ChatMessageInterface {
  private reqi: Reqi;
  private s3Service?: S3Service;

  constructor(reqi: Reqi, s3Service?: S3Service) {
    this.reqi = reqi;
    this.s3Service = s3Service;
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

  async uploadMedia(
    file: File,
    topicId: string,
    messageId?: string
  ): Promise<Media> {
    if (!this.s3Service) {
      throw new Error('S3 service not initialized');
    }

    try {
      const uploadResult = await this.s3Service.uploadFile(file);

      const mediaData: Media = {
        id: '',
        path: uploadResult.path,
        type: file.type,
        messageId: messageId || '',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
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

  async updateMessageStatus(
    messageId: string,
    status: MessageStatus
  ): Promise<{ success: boolean }> {
    try {
      const response = (await this.reqi.patch(
        `/messages/${messageId}/status`,
        { status },
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(
        `Failed to update message status: ${(error as Error).message}`
      );
    }
  }
}
