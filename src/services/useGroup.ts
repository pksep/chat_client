import { ref } from 'vue';
import { IContactProps, IUserProps } from '../components/interfaces/interfaces';
import { getChatSDK, getCurrentUserId } from './useChat';

const groups = ref<IContactProps[]>([]);
const groupMembers = ref<IUserProps[]>([]);

export const fetchGroupMembers = async (
  groupId: string
): Promise<IUserProps[]> => {
  try {
    const sdk = getChatSDK();
    const group = await sdk.getGroup(groupId, { page: 1, limit: 1000 });

    const members = group.members || [];
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
    members: memberUserIDs,
    admins
  });

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
    membersLength: group.members?.length || 0
  };

  groups.value = [groupItem, ...groups.value];
  return { ...group, conversationId: group.topicId, groupId: group.id };
};

const getGroupList = (): IContactProps[] => {
  return groups.value || [];
};

const setGroupList = (value: IContactProps[]): void => {
  groups.value = value || [];
};

const updateGroupList = (value: IContactProps[]): void => {
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

  const index = groups.value.findIndex(group => group.groupId === groupId);
  if (index !== -1) {
    const existing = groups.value[index];
    const updatedGroup = {
      ...existing,
      nickname: groupInfo.groupName || existing.nickname,
      avatarUrl: groupInfo.faceURL || existing.avatarUrl
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

  await sdk.leaveGroup(currentUserId, groupId);
};

export const getGroupInfo = async (groupIds: string[]) => {
  const sdk = getChatSDK();
  const groupResponses = await Promise.all(
    groupIds.map(groupId => sdk.getGroup(groupId))
  );
  return groupResponses;
};

export const fetchGroupMemberCount = async (
  groupId: string
): Promise<number> => {
  try {
    const groupInfo = await getGroupInfo([groupId]);
    return groupInfo?.[0]?.members?.length || 0;
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
