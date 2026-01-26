import { ref } from 'vue';
import { getChatSDK, getCurrentUserId } from '../services/useChat';
import { Message, TopicSetting, TopicType } from '../services/useChatSDK/types';
import type { ITopic, IUser } from '../components/interfaces/interfaces';
import { useTopics } from './useTopics';

const groups = ref<ITopic[]>([]);
const groupMembers = ref<IUser[]>([]);
const currentGroup = ref<ITopic | null>(null);

export const useGroup = () => {
  const setGroups = (newGroups: ITopic[]) => {
    groups.value = [...newGroups];
  };

  const setGroupMembers = (newMembers: IUser[]) => {
    groupMembers.value = [...newMembers];
  };

  const addGroupMembersToList = (groupId: string, newMembers: IUser[]) => {
    const membersToAdd = Array.isArray(newMembers) ? newMembers : [];
    const updatedMembers = [...groupMembers.value, ...membersToAdd];
    groupMembers.value = updatedMembers;
    currentGroup.value.members = updatedMembers;

    const groupIndex = groups.value.findIndex(g => g.id === groupId);
    if (groupIndex !== -1) {
      const updatedGroup = { ...groups.value[groupIndex] };
      if (
        'memberCount' in updatedGroup &&
        typeof updatedGroup.memberCount === 'number'
      ) {
        updatedGroup.memberCount += membersToAdd.length;
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
      currentGroup.value.members = members.data;

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
      await sdk.addGroupMembers(groupId, userIds);
      addGroupMembersToList(groupId, users);
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

  const getGroupList = (): ITopic[] => {
    const { sortTopics } = useTopics();
    setGroupList(sortTopics(groups.value));
    return groups.value;
  };

  const setGroupList = (value: ITopic[]): void => {
    groups.value = value || [];
  };

  const updateGroupList = (value: ITopic[]): void => {
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

    if (currentGroup.value?.id === groupId) {
      currentGroup.value = null;
    }
  };

  const getGroupInfo = async (groupIds: string[]) => {
    const sdk = getChatSDK();
    const groupResponses = await Promise.all(
      groupIds.map(groupId => sdk.getGroup(groupId))
    );

    return groupResponses.map((response: any) => ({
      ...response,
      members: response.members || []
    }));
  };

  const fetchGroupMemberCount = async (groupId: string): Promise<number> => {
    try {
      const groupInfo = await getGroupInfo([groupId]);
      const firstGroup = groupInfo?.[0] as any;
      return (
        (firstGroup && (firstGroup.members || firstGroup.users || [])).length ||
        0
      );
    } catch (err) {
      console.error('Failed to fetch group member count:', err);
      return 0;
    }
  };

  const getGroupById = (groupId: string): ITopic | undefined => {
    try {
      const localGroup = groups.value.find(group => group.id === groupId);
      if (localGroup) {
        currentGroup.value = { ...localGroup };
      } else {
        currentGroup.value = null;
      }
      return currentGroup.value;
    } catch (err) {
      console.error('Failed to fetch group by ID:', err);
      return undefined;
    }
  };

  const updateLocalLastMessageGroup = (
    topicId: string,
    lastMessage: Message
  ): void => {
    const topic = groups.value.find(topic => topic.id === topicId);
    if (topic) {
      topic.lastMessage = lastMessage;

      if (currentGroup.value?.id === topicId) {
        currentGroup.value = { ...currentGroup.value, lastMessage };
      }
    }

    groups.value = [...groups.value];
  };

  const updateLocalGroupDetails = (
    topicId: string,
    name: string,
    avatarUrl: string
  ): void => {
    const topic = groups.value.find(topic => topic.id === topicId);
    if (topic) {
      topic.name = name;
      topic.avatarUrl = avatarUrl;
      if (topic.group) {
        topic.group.title = name;
        topic.group.avatarUrl = avatarUrl;
      }
    }
    groups.value = [...groups.value];
  };

  const updateLocalGroupInfo = (
    topicId: string,
    info: Partial<TopicSetting>
  ): void => {
    const topic = groups.value.find(topic => topic.id === topicId);
    if (topic) {
      topic.info = { ...topic.info, ...info };
    }

    groups.value = [...groups.value];
  };

  const addGroupList = (value: ITopic): void => {
    groups.value = [value, ...groups.value];
  };

  return {
    groups,
    groupMembers,
    currentGroup,
    fetchAllGroups,
    fetchGroupMembers,
    createGroup,
    addGroupMembers,
    removeUserFromGroup,
    getGroupList,
    setGroupList,
    updateGroupList,
    setGroupInfo,
    quitGroup,
    getGroupInfo,
    getGroupById,
    fetchGroupMemberCount,
    updateLocalLastMessageGroup,
    updateLocalGroupDetails,
    updateLocalGroupInfo,
    addGroupList,
    setGroupMembers
  };
};

const {
  fetchAllGroups,
  fetchGroupMembers,
  createGroup,
  addGroupMembers,
  removeUserFromGroup,
  getGroupList,
  setGroupList,
  updateGroupList,
  setGroupInfo,
  quitGroup,
  getGroupInfo,
  getGroupById,
  fetchGroupMemberCount,
  updateLocalLastMessageGroup,
  updateLocalGroupDetails,
  updateLocalGroupInfo,
  addGroupList,
  setGroupMembers
} = useGroup();

export {
  groups,
  groupMembers,
  fetchAllGroups,
  fetchGroupMembers,
  createGroup,
  addGroupMembers,
  removeUserFromGroup,
  getGroupList,
  setGroupList,
  updateGroupList,
  setGroupInfo,
  quitGroup,
  getGroupInfo,
  getGroupById,
  fetchGroupMemberCount,
  updateLocalLastMessageGroup,
  updateLocalGroupDetails,
  updateLocalGroupInfo,
  addGroupList,
  setGroupMembers
};
