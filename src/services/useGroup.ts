import { ref } from 'vue';
import { IUserProps } from '../components/interfaces/interfaces';
import { getChatSDK, getCurrentUserId } from './useChat';
import { Group } from '@pksep/zod-shared-chat';
import type { IContactProps } from '../components/interfaces/interfaces';

enum TopicType {
  Group = 'GROUP',
  DM = 'DM'
}

interface GroupWithMembers extends Group {
  members?: any[];
}

const groups = ref<GroupWithMembers[]>([]);
const groupMembers = ref<IUserProps[]>([]);

export const fetchAllGroups = async (
  page = 1,
  limit = 200
): Promise<GroupWithMembers[]> => {
  try {
    const sdk = getChatSDK();
    const response = await sdk.getTopics(TopicType.Group, {
      page,
      limit
    });

    const groupObjects = response.data.map(topic => ({
      id: topic.id,
      topicId: topic.id,
      title: 'Group ' + topic.id.substring(0, 8),
      description: null,
      avatarUrl: null,
      createdAt: topic.createdAt,
      updatedAt: topic.updatedAt,
      deletedAt: topic.deletedAt || null
    }));

    groups.value = groupObjects;

    return groups.value;
  } catch (err) {
    console.error('Failed to fetch topics');
    return groups.value || [];
  }
};

export const fetchGroupMembers = async (
  groupId: string
): Promise<IUserProps[]> => {
  try {
    const sdk = getChatSDK();
    const group = await sdk.getGroup(groupId, { page: 1, limit: 1000 });

    const groupWithMembers = group as any;
    const members: any[] =
      groupWithMembers.members || groupWithMembers.users || [];
    groupMembers.value = members;

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

  const groupItem: any = {
    id: group.id,
    groupId: group.id,
    conversationId: group.topicId,
    nickname: group.title,
    avatarUrl: group.avatarUrl,
    latestMessage: '',
    latestMessageTime: Date.now(),
    notificationCount: 0,
    isPin: false,
    membersLength: (() => {
      const groupWithMembers = group as any;
      return (
        (groupWithMembers.members || groupWithMembers.users || []).length || 0
      );
    })()
  };

  groups.value = [groupItem, ...groups.value];
  return { ...group, conversationId: group.topicId, groupId: group.id };
};

const getGroupList = (): IContactProps[] => {
  console.log('getGroupList', groups.value);
  return groups.value.map(group => ({
    id: group.id,
    initials: group.title,
    nickname: group.title,
    avatarUrl: group.avatarUrl,
    lastOnline: null,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    deletedAt: group.deletedAt,
    conversationId: group.topicId,
    latestMessage: '',
    membersLength: 0,
    members: []
  }));
};

const setGroupList = (value: GroupWithMembers[]): void => {
  groups.value = value || [];
};

const updateGroupList = (value: GroupWithMembers[]): void => {
  const map = new Map(groups.value.map(group => [group.id, group]));
  value.forEach(item => map.set(item.id, item));
  groups.value = Array.from(map.values());
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
    const next = [...groups.value];
    next[index] = updatedGroup;
    groups.value = next;
  }
};

const quitGroup = async (groupId: string) => {
  const sdk = getChatSDK();
  const currentUserId = getCurrentUserId();
  if (!currentUserId) return;

  await sdk.leaveGroup(groupId);
};

export const getGroupInfo = async (groupIds: string[]) => {
  const sdk = getChatSDK();
  const groupResponses = await Promise.all(
    groupIds.map(groupId => sdk.getGroup(groupId))
  );

  return groupResponses.map((response: any) => ({
    ...response,
    members: response.members || []
  }));
};

export const fetchGroupMemberCount = async (
  groupId: string
): Promise<number> => {
  try {
    const groupInfo = await getGroupInfo([groupId]);
    const firstGroup = groupInfo?.[0] as any;
    return (
      (firstGroup && (firstGroup.members || firstGroup.users || [])).length || 0
    );
  } catch (err) {
    console.error('Failed to fetch group member count:', err);
    return 0;
  }
};

export const removeUserFromGroup = async (
  groupId: string,
  userId: string
): Promise<boolean> => {
  try {
    const sdk = getChatSDK();
    await sdk.removeUserFromGroup(groupId, userId);
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
