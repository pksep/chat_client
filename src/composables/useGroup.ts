import { ref } from 'vue';
import { getChatSDK, getCurrentUserId } from '../services/useChat';
import { TopicType } from '../services/useChatSDK/types';
import type { ITopic, IUser } from '../components/interfaces/interfaces';

const globalGroups = ref<ITopic[]>([]);
const globalGroupMembers = ref<IUser[]>([]);

export const useGroup = () => {
  const groups = globalGroups;
  const groupMembers = globalGroupMembers;

  const setGroups = (newGroups: ITopic[]) => {
    groups.value = [...newGroups];
  };

  const setGroupMembers = (newMembers: IUser[]) => {
    groupMembers.value = [...newMembers];
  };

  const updateGroups = (updatedGroups: ITopic[]) => {
    const map = new Map(groups.value.map(group => [group.id, group]));
    updatedGroups.forEach(item => map.set(item.id, item));
    groups.value = [...Array.from(map.values())];
  };

  const addGroupMembersToList = (groupId: string, newMembers: IUser[]) => {
    const updatedMembers = [...groupMembers.value, ...newMembers];
    groupMembers.value = updatedMembers;

    const groupIndex = groups.value.findIndex(g => g.id === groupId);
    if (groupIndex !== -1) {
      const updatedGroup = { ...groups.value[groupIndex] };
      if (
        'memberCount' in updatedGroup &&
        typeof updatedGroup.memberCount === 'number'
      ) {
        updatedGroup.memberCount += newMembers.length;
      }
      const updatedGroups = [...groups.value];
      updatedGroups[groupIndex] = updatedGroup;
      groups.value = updatedGroups;
    }
  };

  const removeGroupMember = (groupId: string, userId: string) => {
    const updatedMembers = groupMembers.value.filter(
      member => member.id !== userId
    );
    groupMembers.value = updatedMembers;

    const groupIndex = groups.value.findIndex(g => g.id === groupId);
    if (groupIndex !== -1) {
      const updatedGroup = { ...groups.value[groupIndex] };
      if (
        'memberCount' in updatedGroup &&
        typeof updatedGroup.memberCount === 'number' &&
        updatedGroup.memberCount > 0
      ) {
        updatedGroup.memberCount -= 1;
      }
      const updatedGroups = [...groups.value];
      updatedGroups[groupIndex] = updatedGroup;
      groups.value = updatedGroups;
    }
  };

  const fetchAllGroups = async (page = 1, limit = 200): Promise<ITopic[]> => {
    try {
      const sdk = getChatSDK();
      if (!sdk) {
        console.error('Chat SDK is not initialized');
        return groups.value || [];
      }

      const response = await sdk.getTopics(TopicType.Group, {
        page,
        limit
      });

      setGroups(response.data);

      return response.data;
    } catch (err) {
      console.error('Failed to fetch topics', err);
      return groups.value || [];
    }
  };

  const fetchGroupMembers = async (groupId: string): Promise<IUser[]> => {
    const sdk = getChatSDK();
    if (!sdk) {
      console.error('Chat SDK is not initialized');
      return [];
    }

    try {
      const { members } = await sdk.getGroup(groupId);

      setGroupMembers(members.data);

      return groupMembers.value;
    } catch (err) {
      console.error('Failed to fetch group members:', err);
      return [];
    }
  };

  const createGroup = async (
    memberUserIDs: string[],
    name: string,
    imageUrl: string
  ) => {
    const sdk = getChatSDK();

    const currentUserId = getCurrentUserId();
    const admins = currentUserId ? [currentUserId] : [];

    const group = await sdk.createGroup({
      title: name,
      description: '',
      avatarUrl: imageUrl || '',
      memberIds: memberUserIDs,
      admins
    });

    if (!group || !group.id) {
      console.error('[createGroup] SDK returned invalid group:', group);
      throw new Error('Failed to create group: invalid response from server');
    }

    return group;
  };

  const getGroupList = (): ITopic[] => {
    const currentGroups = groups.value || [];
    return [...currentGroups];
  };

  const setGroupList = (value: ITopic[]): void => {
    setGroups(value || []);
  };

  const updateGroupList = (value: ITopic[]): void => {
    updateGroups(value);
  };

  const setGroupInfo = async (
    groupId: string,
    groupInfo: Partial<{
      groupName?: string;
      faceURL?: string;
      introduction?: string;
      notification?: string;
      ex?: string;
    }>
  ) => {
    const sdk = getChatSDK();
    if (!sdk) {
      console.error('Chat SDK is not initialized');
      return;
    }

    await sdk.editGroup(groupId, {
      title: groupInfo.groupName,
      description: groupInfo.introduction,
      avatarUrl: groupInfo.faceURL
    });

    const index = groups.value.findIndex(group => group.id === groupId);
    if (index !== -1) {
      const existing = groups.value[index];
      const updatedGroup = {
        ...existing,
        nickname: groupInfo.groupName,
        avatarUrl: groupInfo.faceURL
      };
      const updatedGroups = [...groups.value];
      updatedGroups[index] = updatedGroup;
      setGroups(updatedGroups);
    }
  };

  const quitGroup = async (groupId: string) => {
    const sdk = getChatSDK();
    if (!sdk) {
      console.error('Chat SDK is not initialized');
      return;
    }

    const currentUserId = getCurrentUserId();
    if (!currentUserId) return;

    await sdk.leaveGroup(groupId);

    // Refresh the groups list to ensure UI updates
    await fetchAllGroups();
  };

  const getGroupInfo = async (groupIds: string[]) => {
    const sdk = getChatSDK();
    if (!sdk) {
      console.error('Chat SDK is not initialized');
      return [];
    }

    const groupResponses = await Promise.all(
      groupIds.map(groupId => sdk.getGroup(groupId))
    );

    return groupResponses.map((response: any) => ({
      ...response,
      members: [...(response.members || [])] // Ensure new array reference
    }));
  };

  const fetchGroupMemberCount = async (groupId: string): Promise<number> => {
    try {
      const groupInfo = await getGroupInfo([groupId]);
      const firstGroup = groupInfo?.[0] as any;
      return (firstGroup && [...(firstGroup.members || [])]).length || 0; // Ensure new array reference
    } catch (err) {
      console.error('Failed to fetch group member count:', err);
      return 0;
    }
  };

  const addGroupMembers = async (
    groupId: string,
    users: IUser[]
  ): Promise<boolean> => {
    const sdk = getChatSDK();
    if (!sdk) {
      console.error('Chat SDK is not initialized');
      return false;
    }

    try {
      const userIds = users.map(user => user.id);

      const newMembers = await sdk.addGroupMembers(groupId, userIds);

      addGroupMembersToList(groupId, newMembers);
      await fetchGroupMembers(groupId);
      return true;
    } catch (err) {
      console.error('Failed to add members to group:', err);
      return false;
    }
  };

  const removeUserFromGroup = async (
    groupId: string,
    userId: string
  ): Promise<boolean> => {
    const sdk = getChatSDK();
    if (!sdk) {
      console.error('Chat SDK is not initialized');
      return false;
    }

    try {
      await sdk.removeUserFromGroup(groupId, userId);

      removeGroupMember(groupId, userId);

      await fetchGroupMembers(groupId);

      return true;
    } catch (err) {
      console.error('Failed to remove user from group:', err);
      return false;
    }
  };

  return {
    groups,
    groupMembers,
    fetchAllGroups,
    fetchGroupMembers,
    createGroup,
    getGroupList,
    setGroupList,
    updateGroupList,
    setGroupInfo,
    quitGroup,
    getGroupInfo,
    fetchGroupMemberCount,
    addGroupMembers,
    removeUserFromGroup
  };
};
