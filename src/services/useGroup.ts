import { ref } from 'vue';
import { getChatSDK, getCurrentUserId } from './useChat';
import { TopicType } from './useChatSDK/types';
import type { ITopic, IUser } from '../components/interfaces/interfaces';

const groups = ref<ITopic[]>([]);
const groupMembers = ref<IUser[]>([]);

export const fetchAllGroups = async (
  page = 1,
  limit = 200
): Promise<ITopic[]> => {
  try {
    const sdk = getChatSDK();
    const response = await sdk.getTopics(TopicType.Group, {
      page,
      limit
    });

    // Force reactivity by creating new array reference
    groups.value = [...response.data];

    return groups.value;
  } catch (err) {
    console.error('Failed to fetch topics');
    return groups.value || [];
  }
};

export const fetchGroupMembers = async (groupId: string): Promise<IUser[]> => {
  try {
    const sdk = getChatSDK();
    const { members } = await sdk.getGroup(groupId);

    // Force reactivity by creating new array reference
    groupMembers.value = [...members.data];

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
  // Return a new array reference to ensure Vue reactivity
  return [...currentGroups];
};

const setGroupList = (value: ITopic[]): void => {
  groups.value = [...(value || [])]; // Ensure new array reference
};

const updateGroupList = (value: ITopic[]): void => {
  const map = new Map(groups.value.map(group => [group.id, group]));
  value.forEach(item => map.set(item.id, item));
  groups.value = [...Array.from(map.values())]; // Ensure new array reference
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
    // Force reactivity by creating new array reference
    const updatedGroups = [...groups.value];
    updatedGroups[index] = updatedGroup;
    groups.value = updatedGroups;
  }
};

const quitGroup = async (groupId: string) => {
  const sdk = getChatSDK();
  const currentUserId = getCurrentUserId();
  if (!currentUserId) return;

  await sdk.leaveGroup(groupId);

  // Refresh the groups list to ensure UI updates
  await fetchAllGroups();
};

export const getGroupInfo = async (groupIds: string[]) => {
  const sdk = getChatSDK();
  const groupResponses = await Promise.all(
    groupIds.map(groupId => sdk.getGroup(groupId))
  );

  return groupResponses.map((response: any) => ({
    ...response,
    members: [...(response.members || [])] // Ensure new array reference
  }));
};

export const fetchGroupMemberCount = async (
  groupId: string
): Promise<number> => {
  try {
    const groupInfo = await getGroupInfo([groupId]);
    const firstGroup = groupInfo?.[0] as any;
    return (firstGroup && [...(firstGroup.members || [])]).length || 0; // Ensure new array reference
  } catch (err) {
    console.error('Failed to fetch group member count:', err);
    return 0;
  }
};

export const addGroupMembers = async (
  groupId: string,
  users: IUser[]
): Promise<boolean> => {
  try {
    const sdk = getChatSDK();
    const userIds = users.map(user => user.id);

    const result = await sdk.addGroupMembers(groupId, userIds);

    if (result.success) {
      const newMembers = result.addedMembers;

      // Force reactivity by creating new array references
      const updatedMembers = [...groupMembers.value, ...newMembers];
      groupMembers.value = updatedMembers;

      // Update the specific group in the global groups list
      const groupIndex = groups.value.findIndex(g => g.id === groupId);
      if (groupIndex !== -1) {
        const updatedGroup = { ...groups.value[groupIndex] };
        // Update member count if available
        if (typeof updatedGroup.memberCount === 'number') {
          updatedGroup.memberCount += newMembers.length;
        }
        // Force reactivity by creating new array reference
        const updatedGroups = [...groups.value];
        updatedGroups[groupIndex] = updatedGroup;
        groups.value = updatedGroups;
      }

      // Refresh the group members list to ensure UI updates
      await fetchGroupMembers(groupId);
    }

    return result.success;
  } catch (err) {
    console.error('Failed to add members to group:', err);
    return false;
  }
};

export const removeUserFromGroup = async (
  groupId: string,
  userId: string
): Promise<boolean> => {
  try {
    const sdk = getChatSDK();
    await sdk.removeUserFromGroup(groupId, userId);

    // Update the local group members cache
    const updatedMembers = groupMembers.value.filter(member => member.id !== userId);
    groupMembers.value = updatedMembers;

    // Update the specific group in the global groups list
    const groupIndex = groups.value.findIndex(g => g.id === groupId);
    if (groupIndex !== -1) {
      const updatedGroup = { ...groups.value[groupIndex] };
      // Update member count if available
      if (typeof updatedGroup.memberCount === 'number' && updatedGroup.memberCount > 0) {
        updatedGroup.memberCount -= 1;
      }
      // Force reactivity by creating new array reference
      const updatedGroups = [...groups.value];
      updatedGroups[groupIndex] = updatedGroup;
      groups.value = updatedGroups;
    }

    // Refresh the group members list to ensure UI updates
    await fetchGroupMembers(groupId);

    return true;
  } catch (err) {
    console.error('Failed to remove user from group:', err);
    return false;
  }
};

export {
  createGroup,
  getGroupList,
  setGroupList,
  updateGroupList,
  setGroupInfo,
  quitGroup
};
