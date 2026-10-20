import { Topic, TopicSetting, User } from '@pksep/zod-shared-chat';
import { Reqi } from '@pksep/reqi';
import { readJson } from './read-json';
import { CHAT_CONTENT_REQUEST_TIMEOUT_MS } from '../../utils/network-timeout';
import { PaginatedResponse } from './types';
import { ITopic } from '../../components/interfaces/interfaces';
import type { TopicSyncState, TopicSyncResponse } from '../../utils/topic-sync';
import { topicSyncEndpoint } from '../../utils/topic-sync';
import {
  collectTopicPages,
  TOPICS_PAGE_SIZE
} from '../../utils/topic-pagination';

export interface TopicQuery {
  page?: number;
  limit?: number;
  type?: 'DM' | 'GROUP';
  scope?: 'all' | 'chats' | 'clients' | 'sidebar';
  includeUnread?: boolean;
  includeSync?: boolean;
}

export interface TopicPagesOptions {
  scope?: TopicQuery['scope'];
  onPage?: (topics: ITopic[], complete: boolean) => void | Promise<void>;
  isCurrent?: () => boolean;
}

export interface ChatTopicInterface {
  getTopics(params?: TopicQuery): Promise<PaginatedResponse<ITopic>>;
  getAllTopics(options?: TopicPagesOptions): Promise<ITopic[]>;
  syncTopics(state: TopicSyncState): Promise<TopicSyncResponse>;
  createTopic(topicData: { peerId: string }): Promise<Topic>;
  deleteTopic(topicId: string): Promise<void>;
  togglePinTopic(topicId: string): Promise<TopicSetting>;
  toggleMuteTopic(topicId: string): Promise<TopicSetting>;
  setTopicMarkedUnread(
    topicId: string,
    isMarkedUnread: boolean
  ): Promise<TopicSetting>;
  getTopicSettings(topicId: string, userId: string): Promise<TopicSetting>;
  updateTopicSettings(
    topicId: string,
    userId: string,
    settings: Partial<TopicSetting>
  ): Promise<TopicSetting>;
  leaveTopic(topicId: string): Promise<void>;
  getTopicById(topicId: string): Promise<Topic>;
  getTopicParticipants(topicId: string): Promise<User[]>;
  createDMWithUser(peerId: string): Promise<Topic>;
  updateTopic(
    topicId: string,
    topicData: Partial<{
      title?: string;
      description?: string;
      avatarUrl?: string;
    }>
  ): Promise<Topic>;
}

export class ChatTopic implements ChatTopicInterface {
  private reqi: Reqi;

  constructor(reqi: Reqi) {
    this.reqi = reqi;
  }

  async getTopics(params?: TopicQuery): Promise<PaginatedResponse<ITopic>> {
    const queryParams = new URLSearchParams();
    queryParams.append('page', String(params?.page ?? 1));
    queryParams.append('limit', String(params?.limit ?? TOPICS_PAGE_SIZE));
    if (params?.type) queryParams.append('type', params.type);
    queryParams.append('scope', params?.scope ?? 'chats');
    if (params?.includeUnread) queryParams.append('includeUnread', 'true');
    if (params?.includeSync) queryParams.append('includeSync', 'true');

    const queryString = queryParams.toString();
    const endpoint = `/topics${queryString ? `?${queryString}` : ''}`;

    try {
      return await readJson<PaginatedResponse<ITopic>>(this.reqi, endpoint, {
        timeoutMs: CHAT_CONTENT_REQUEST_TIMEOUT_MS
      });
    } catch (error) {
      throw new Error(`Failed to fetch topics: ${(error as Error).message}`);
    }
  }

  getAllTopics(options?: TopicPagesOptions): Promise<ITopic[]> {
    return collectTopicPages(
      (page, limit) => this.getTopics({ page, limit, scope: options?.scope }),
      options
    );
  }

  syncTopics(state: TopicSyncState): Promise<TopicSyncResponse> {
    return readJson<TopicSyncResponse>(this.reqi, topicSyncEndpoint(state), {
      timeoutMs: CHAT_CONTENT_REQUEST_TIMEOUT_MS
    });
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
      await this.reqi.delete(`/topics/${topicId}`, {
        parsed: false
      });
    } catch (error) {
      throw new Error(`Failed to delete topic: ${(error as Error).message}`);
    }
  }

  async togglePinTopic(topicId: string): Promise<TopicSetting> {
    try {
      const response = (await this.reqi.patch<TopicSetting>(
        `/topics/${topicId}/pin`,
        {}
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(
        `Failed to toggle pin topic: ${(error as Error).message}`
      );
    }
  }

  async toggleMuteTopic(topicId: string): Promise<TopicSetting> {
    try {
      const response = (await this.reqi.patch<TopicSetting>(
        `/topics/${topicId}/mute`,
        {},
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

  async setTopicMarkedUnread(
    topicId: string,
    isMarkedUnread: boolean
  ): Promise<TopicSetting> {
    try {
      const response = (await this.reqi.patch<TopicSetting>(
        `/topics/${topicId}/marked-unread`,
        { isMarkedUnread },
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(
        `Failed to set topic marked unread: ${(error as Error).message}`
      );
    }
  }

  async getTopicSettings(
    topicId: string,
    userId: string
  ): Promise<TopicSetting> {
    try {
      return await readJson<TopicSetting>(
        this.reqi,
        `/topics/${topicId}/settings/${userId}`
      );
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

  async leaveTopic(topicId: string): Promise<void> {
    try {
      await this.reqi.delete(`/topics/${topicId}/leave`, {
        parsed: false
      });
    } catch (error) {
      throw new Error(`Failed to leave topic: ${(error as Error).message}`);
    }
  }

  async getTopicById(topicId: string): Promise<Topic> {
    try {
      return await readJson<Topic>(this.reqi, `/topics/${topicId}`);
    } catch (error) {
      throw new Error(`Failed to fetch topic: ${(error as Error).message}`);
    }
  }

  async getTopicParticipants(topicId: string): Promise<User[]> {
    try {
      return await readJson<User[]>(
        this.reqi,
        `/topics/${topicId}/participants`
      );
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
