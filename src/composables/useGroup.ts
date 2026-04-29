import { ref } from 'vue';
import { getChatSDK, getCurrentUserId } from '../services/useChat';
import { Message, TopicSetting } from '../services/useChatSDK/types';
import type { ITopic, IUser } from '../components/interfaces/interfaces';
import { setTopics, topics, useTopics } from './useTopics';
import { getFullMessagesByTopicId } from '../services/useMessages';

const currentGroup = ref<ITopic | null>(null);
const loading = ref(false);

export const useGroup = () => {
  const addGroupMembersToList = (groupId: string, newMembers: IUser[]) => {
    const membersToAdd = Array.isArray(newMembers) ? newMembers : [];
    const updatedMembers = [...currentGroup.value.members, ...membersToAdd];
    currentGroup.value.members = updatedMembers;

    const groupIndex = topics.value.findIndex(g => g.group?.id === groupId);

    if (groupIndex !== -1) {
      const updatedGroup = { ...topics.value[groupIndex] };
      if (
        'memberCount' in updatedGroup &&
        typeof updatedGroup.memberCount === 'number'
      ) {
        updatedGroup.memberCount += membersToAdd.length;
      }

      updatedGroup.members = updatedMembers;
      const updatedGroups = [...topics.value];
      updatedGroups[groupIndex] = updatedGroup;
      setTopics(updatedGroups);
    }
  };

  const removeGroupMember = (groupId: string, userId: string) => {
    const updatedMembers = currentGroup.value.members.filter(
      member => member.id !== userId
    );
    currentGroup.value.members = updatedMembers;

    const groupIndex = topics.value.findIndex(g => g.group?.id === groupId);
    if (groupIndex !== -1) {
      const updatedGroup = { ...topics.value[groupIndex] };
      if (
        'memberCount' in updatedGroup &&
        typeof updatedGroup.memberCount === 'number' &&
        updatedGroup.memberCount > 0
      ) {
        updatedGroup.memberCount -= 1;
      }
      updatedGroup.members = updatedMembers;
      const updatedGroups = [...topics.value];
      updatedGroups[groupIndex] = updatedGroup;
      setTopics(updatedGroups);
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

      return true;
    } catch (err) {
      console.error('Failed to remove user from group:', err);
      return false;
    }
  };

  const getGroupList = (): ITopic[] => {
    const { sortTopics } = useTopics();
    return sortTopics(topics.value || []);
  };

  const setGroupList = (value: ITopic[]): void => {
    topics.value = value || [];
  };

  const updateGroupList = (value: ITopic[]): void => {
    const map = new Map(topics.value.map(group => [group.id, group]));
    value.forEach(item => map.set(item.id, item));
    topics.value = Array.from(map.values());
  };

  const setGroupInfo = async (
    groupId: string,
    groupInfo: Partial<{
      groupName?: string;
      avatarUrl?: string;
      description?: string;
      notification?: string;
      ex?: string;
    }>
  ) => {
    const sdk = getChatSDK();
    await sdk.editGroup(groupId, {
      title: groupInfo.groupName,
      description: groupInfo.description,
      avatarUrl: groupInfo.avatarUrl
    });

    const index = topics.value.findIndex(group => group.id === groupId);
    if (index !== -1) {
      const existing = topics.value[index];
      const updatedGroup = {
        ...existing,
        nickname: groupInfo.groupName,
        avatarUrl: groupInfo.avatarUrl
      };
      const next = [...topics.value];
      next[index] = updatedGroup;
      topics.value = next;
    }
  };

  const quitGroup = async (groupId: string) => {
    const sdk = getChatSDK();
    const currentUserId = getCurrentUserId();
    if (!currentUserId) return;

    await sdk.leaveGroup(groupId);
  };

  const deleteGroup = async (groupId: string) => {
    const sdk = getChatSDK();
    const currentUserId = getCurrentUserId();
    if (!currentUserId) return;

    await sdk.deleteGroup(groupId);
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
      const localGroup = topics.value.find(group => group.id === groupId);
      if (localGroup) {
        currentGroup.value = { ...localGroup };
        currentGroup.value.members = localGroup.members.map(item =>
          'dataValues' in item ? item.dataValues : item
        ) as IUser[];
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
    lastMessage?: Message
  ): void => {
    const topic = topics.value.find(topic => topic.id === topicId);
    const messages = getFullMessagesByTopicId(topicId);

    if (topic) {
      if (lastMessage) {
        topic.lastMessage = lastMessage;
      } else {
        topic.lastMessage = messages.at(-1);
      }

      if (currentGroup.value?.id === topicId) {
        currentGroup.value = {
          ...currentGroup.value,
          lastMessage: topic.lastMessage
        };
      }
    }

    topics.value = [...topics.value];
  };

  const updateLocalGroupDetails = (
    topicId: string,
    name: string,
    avatarUrl: string
  ): void => {
    const topic = topics.value.find(topic => topic.id === topicId);
    if (topic) {
      topic.name = name;
      topic.avatarUrl = avatarUrl;
      if (topic.group) {
        topic.group.title = name;
        topic.group.avatarUrl = avatarUrl;
      }
    }
    topics.value = [...topics.value];
  };

  const updateLocalGroupInfo = (
    topicId: string,
    info: Partial<TopicSetting>
  ): void => {
    const topic = topics.value.find(topic => topic.id === topicId);
    if (topic) {
      topic.info = { ...topic.info, ...info };
    }

    topics.value = [...topics.value];
  };

  return {
    currentGroup,
    loading,
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
    deleteGroup
  };
};

const {
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
  deleteGroup
} = useGroup();

export {
  topics as groups,
  currentGroup,
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
  deleteGroup
};
