import { User, Topic } from '@pksep/zod-shared-chat';
import { Reqi } from '@pksep/reqi';
import { SearchParams, PaginatedResponse } from './types';
import type { UserStatusValue } from '../../utils/userStatus';

export interface ChatUserInterface {
  getUsers(params?: SearchParams): Promise<PaginatedResponse<User>>;
  createUser(userData: Partial<User>): Promise<User>;
  getUserProfile(userId: string): Promise<User>;
  updateUserProfile(userId: string, profileData: Partial<User>): Promise<User>;
  removeUserStatusPreset(status: UserStatusValue): Promise<User>;
  getRecentTopics(userId: string): Promise<Topic[]>;
}

export class ChatUser implements ChatUserInterface {
  private reqi: Reqi;

  constructor(reqi: Reqi) {
    this.reqi = reqi;
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
      const response = (await this.reqi.patch<User>('/users', profileData, {
        parsed: false
      })) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(
        `Failed to update user profile: ${(error as Error).message}`
      );
    }
  }

  async removeUserStatusPreset(status: UserStatusValue): Promise<User> {
    const response = await this.reqi.sendRequest('/users/status-presets', {
      request: { method: 'DELETE', body: status },
      parsed: false
    });
    return response.json();
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
}
