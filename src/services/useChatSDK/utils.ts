import { Topic, Message } from '@pksep/zod-shared-chat';
import { Reqi } from '@pksep/reqi';
import { SearchParams, PaginatedResponse } from './types';

export interface ChatUtilsInterface {
  searchMessages(
    query: string,
    params?: SearchParams
  ): Promise<PaginatedResponse<Message & { topic: Topic }>>;
  searchTopics(
    query: string,
    params?: SearchParams
  ): Promise<PaginatedResponse<Topic>>;
  getUnreadCounts(): Promise<{
    totalUnread: number;
    topicsUnread: { [topicId: string]: number };
  }>;
}

export class ChatUtils implements ChatUtilsInterface {
  private reqi: Reqi;

  constructor(reqi: Reqi) {
    this.reqi = reqi;
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
}
