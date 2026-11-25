import { Message, Topic, Media } from '@pksep/zod-shared-chat';
import { Reqi } from '@pksep/reqi';
import { readJson } from './read-json';
import { CHAT_CONTENT_REQUEST_TIMEOUT_MS } from '../../utils/network-timeout';
import { withNetworkTimeout } from '../../utils/network-timeout';
import type {
  PinComment,
  PinCommentAck,
  PinCommentCommand
} from '../pin-comments';
import {
  SearchParams,
  PaginatedResponse,
  MessageStatus,
  CallHistoryResponse
} from './types';

export interface TopicAttachmentItem {
  media: Media;
  message: Message;
}

export interface TopicAttachmentsPage {
  items: TopicAttachmentItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface TopicAttachmentsOptions {
  limit?: number;
  cursor?: string;
}

export interface ChatMessageInterface {
  editMessage(
    topicId: string,
    messageId: string,
    content: string
  ): Promise<Message>;
  deleteMessage(topicId: string, messageId: string): Promise<void>;
  clearTopicHistory(topicId: string): Promise<void>;
  toggleMessageReaction(
    topicId: string,
    messageId: string,
    emoji: string
  ): Promise<{ success: boolean }>;
  uploadMedia(file: File): Promise<Media>;
  searchMessages(
    query: string,
    params?: SearchParams
  ): Promise<PaginatedResponse<Message & { topic: Topic }>>;
  updateMessageStatus(
    messageId: string,
    status: MessageStatus
  ): Promise<{ success: boolean }>;
  getMessages(
    topicId: string,
    opts?: {
      limit?: number;
      lastMessageId?: string;
      afterMessageId?: string;
      newMessages?: boolean;
      fresh?: boolean;
    }
  ): Promise<Message[]>;
  getTopicMedia(
    topicId: string,
    opts?: TopicAttachmentsOptions
  ): Promise<TopicAttachmentsPage>;
  getTopicFiles(
    topicId: string,
    opts?: TopicAttachmentsOptions
  ): Promise<TopicAttachmentsPage>;
  getCallHistory(opts?: {
    page?: number;
    limit?: number;
  }): Promise<CallHistoryResponse>;
  getPinnedMessages(topicId: string): Promise<Message[]>;
  getPinComments(
    topicId: string
  ): Promise<{ version: number; comments: PinComment[] }>;
  sendPinCommentCommand(
    topicId: string,
    command: PinCommentCommand
  ): Promise<PinCommentAck>;
  getAroundMessage(messageId: string): Promise<Message[]>;
}

export class ChatMessage implements ChatMessageInterface {
  private reqi: Reqi;

  constructor(reqi: Reqi) {
    this.reqi = reqi;
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
        `/messages/topic/${topicId}/${messageId}`,
        {
          parsed: false
        }
      );
      await response.json();
    } catch (error) {
      throw new Error(`Failed to delete message: ${(error as Error).message}`, {
        cause: error
      });
    }
  }

  async clearTopicHistory(topicId: string): Promise<void> {
    try {
      const response = await this.reqi.delete(`/messages/topic/${topicId}`, {
        parsed: false
      });
      await response.json();
    } catch (error) {
      throw new Error(
        `Failed to clear topic history: ${(error as Error).message}`
      );
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

  async uploadMedia(file: File): Promise<Media> {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = (await this.reqi.post<Media>('/media/upload', formData, {
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
    if (params?.topicId) queryParams.append('topicId', params.topicId);

    const queryString = queryParams.toString();
    const endpoint = `/search/messages${queryString ? `?${queryString}` : ''}`;

    try {
      return await readJson<PaginatedResponse<Message & { topic: Topic }>>(
        this.reqi,
        endpoint
      );
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

  async getMessages(
    topicId: string,
    opts?: {
      limit?: number;
      lastMessageId?: string;
      afterMessageId?: string;
      newMessages?: boolean;
      fresh?: boolean;
    }
  ): Promise<Message[]> {
    const queryParams = new URLSearchParams();
    if (opts?.limit) queryParams.append('limit', opts.limit.toString());
    if (opts?.lastMessageId)
      queryParams.append('lastMessageId', opts.lastMessageId);
    if (opts?.afterMessageId)
      queryParams.append('afterMessageId', opts.afterMessageId);
    if (opts?.newMessages) queryParams.append('newMessages', 'true');

    const queryString = queryParams.toString();
    const endpoint = `/messages/topic/${topicId}${queryString ? `?${queryString}` : ''}`;

    try {
      return await readJson<Message[]>(this.reqi, endpoint, {
        reusePending: !opts?.fresh,
        timeoutMs: CHAT_CONTENT_REQUEST_TIMEOUT_MS
      });
    } catch (error) {
      throw new Error(`Failed to fetch messages: ${(error as Error).message}`);
    }
  }

  private async getTopicAttachments(
    topicId: string,
    kind: 'media' | 'files',
    opts?: TopicAttachmentsOptions
  ): Promise<TopicAttachmentsPage> {
    const queryParams = new URLSearchParams();

    if (opts?.limit) queryParams.append('limit', opts.limit.toString());
    if (opts?.cursor) queryParams.append('cursor', opts.cursor);

    const queryString = queryParams.toString();
    const endpoint = `/messages/topic/${topicId}/${kind}${queryString ? `?${queryString}` : ''}`;

    try {
      return await readJson<TopicAttachmentsPage>(this.reqi, endpoint);
    } catch (error) {
      throw new Error(
        `Failed to fetch topic attachments: ${(error as Error).message}`
      );
    }
  }

  async getTopicMedia(
    topicId: string,
    opts?: TopicAttachmentsOptions
  ): Promise<TopicAttachmentsPage> {
    return this.getTopicAttachments(topicId, 'media', opts);
  }

  async getTopicFiles(
    topicId: string,
    opts?: TopicAttachmentsOptions
  ): Promise<TopicAttachmentsPage> {
    return this.getTopicAttachments(topicId, 'files', opts);
  }

  async getCallHistory(opts?: {
    page?: number;
    limit?: number;
  }): Promise<CallHistoryResponse> {
    const queryParams = new URLSearchParams();

    if (opts?.page) queryParams.append('page', opts.page.toString());
    if (opts?.limit) queryParams.append('limit', opts.limit.toString());

    const queryString = queryParams.toString();
    const endpoint = `/messages/calls/history${queryString ? `?${queryString}` : ''}`;

    try {
      return await readJson<CallHistoryResponse>(this.reqi, endpoint);
    } catch (error) {
      throw new Error(
        `Failed to fetch call history: ${(error as Error).message}`
      );
    }
  }

  async getPinnedMessages(topicId: string): Promise<Message[]> {
    try {
      return await readJson<Message[]>(
        this.reqi,
        `/messages/topic/${topicId}/pinned`
      );
    } catch (error) {
      throw new Error(
        `Failed to fetch pinned messages: ${(error as Error).message}`
      );
    }
  }

  getPinComments(
    topicId: string
  ): Promise<{ version: number; comments: PinComment[] }> {
    return readJson(this.reqi, `/messages/topic/${topicId}/pin-comments`, {
      reusePending: false
    });
  }

  sendPinCommentCommand(
    topicId: string,
    command: PinCommentCommand
  ): Promise<PinCommentAck> {
    return withNetworkTimeout(async signal => {
      const response = await this.reqi.post(
        `/messages/topic/${topicId}/pin-comments/commands`,
        command,
        { parsed: false, requset: { signal } }
      );
      return (await response.json()) as PinCommentAck;
    }, 20_000);
  }

  async getAroundMessage(messageId: string): Promise<Message[]> {
    try {
      return await readJson<Message[]>(
        this.reqi,
        `/messages/${messageId}/around`
      );
    } catch (error) {
      throw new Error(
        `Failed to fetch pinned messages: ${(error as Error).message}`
      );
    }
  }
}
