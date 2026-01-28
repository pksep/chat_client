import { Group, User } from '@pksep/zod-shared-chat';
import { Reqi } from '@pksep/reqi';
import { SearchParams, PaginatedResponse } from './types';

export interface ChatGroupInterface {
  createGroup(groupData: {
    title: string;
    description?: string;
    avatarUrl?: string;
    memberIds: string[];
    admins: string[];
  }): Promise<Group>;
  deleteGroup(groupId: string): Promise<void>;
  getGroup(
    groupId: string,
    params?: SearchParams
  ): Promise<{ group: Group; members: PaginatedResponse<User> }>;
  updateGroup(
    groupId: string,
    groupData: Partial<{
      title: string;
      description?: string;
      avatarUrl?: string;
      memberIds: string[];
      admins: string[];
    }>
  ): Promise<Group>;
  leaveGroup(groupId: string): Promise<void>;
  addGroupMembers(groupId: string, userIds: string[]): Promise<User[]>;
  removeGroupMember(groupId: string, userId: string): Promise<number>;
  promoteToAdmin(
    groupId: string,
    userId: string
  ): Promise<{ success: boolean }>;
  demoteFromAdmin(
    groupId: string,
    userId: string
  ): Promise<{ success: boolean }>;
  addUsersToGroup(
    groupId: string,
    userIds: string[]
  ): Promise<{ success: boolean; addedMembers: User[] }>;
  removeUserFromGroup(groupId: string, userId: string): Promise<number>;
  editGroup(
    groupId: string,
    groupData: Partial<{
      title: string;
      description?: string;
      avatarUrl?: string;
      memberIds: string[];
      admins: string[];
    }>
  ): Promise<Group>;
}

export class ChatGroup implements ChatGroupInterface {
  private reqi: Reqi;

  constructor(reqi: Reqi) {
    this.reqi = reqi;
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

  async getGroup(
    groupId: string,
    params?: SearchParams
  ): Promise<{ group: Group; members: PaginatedResponse<User> }> {
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
      await this.reqi.delete(`/groups/${groupId}/leave`, {
        parsed: false
      });
    } catch (error) {
      throw new Error(`Failed to leave group: ${(error as Error).message}`);
    }
  }

  async addGroupMembers(groupId: string, userIds: string[]): Promise<User[]> {
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

  async removeGroupMember(groupId: string, userId: string): Promise<number> {
    try {
      await this.reqi.delete(`/groups/${groupId}/members/${userId}`, {
        parsed: false
      });
      return 200;
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

  async addUsersToGroup(
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
        `Failed to add users to group: ${(error as Error).message}`
      );
    }
  }

  async removeUserFromGroup(groupId: string, userId: string): Promise<number> {
    try {
      const response = (await this.reqi.delete(
        `/groups/${groupId}/members/${userId}`,
        {
          parsed: false
        }
      )) as any;
      return response.status;
    } catch (error) {
      throw new Error(
        `Failed to remove user from group: ${(error as Error).message}`
      );
    }
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
    try {
      const response = (await this.reqi.patch<Group>(
        `/groups/${groupId}`,
        groupData,
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(`Failed to edit group: ${(error as Error).message}`);
    }
  }
}
