import { Topic, Message, TopicSetting, User } from '@pksep/zod-shared-chat';
import { Reqi } from '@pksep/reqi';
import { SearchParams, PaginatedResponse, TopicType } from './types';

export interface ChatTopicInterface {
  getTopics(type?: TopicType, params?: SearchParams): Promise<PaginatedResponse<Topic & { lastMessage?: Message }>>;
  createTopic(topicData: { peerId: string }): Promise<Topic>;
  deleteTopic(topicId: string): Promise<void>;
  togglePinTopic(topicId: string, userId: string): Promise<TopicSetting>;
  toggleMuteTopic(topicId: string, userId: string): Promise<TopicSetting>;
  muteTopic(topicId: string, userId: string): Promise<TopicSetting>;
  unmuteTopic(topicId: string, userId: string): Promise<TopicSetting>;
  getTopicSettings(topicId: string, userId: string): Promise<TopicSetting>;
  updateTopicSettings(topicId: string, userId: string, settings: Partial<TopicSetting>): Promise<TopicSetting>;
  joinTopic(topicId: string): Promise<{ success: boolean }>;
  leaveTopic(topicId: string): Promise<void>;
  getTopicById(topicId: string): Promise<Topic>;
  getTopicParticipants(topicId: string): Promise<User[]>;
  createDMWithUser(peerId: string): Promise<Topic>;
  updateTopic(topicId: string, topicData: Partial<{ title?: string; description?: string; avatarUrl?: string; }>): Promise<Topic>;
}

export class ChatTopic implements ChatTopicInterface {
  private reqi: Reqi;

  constructor(reqi: Reqi) {
    this.reqi = reqi;
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