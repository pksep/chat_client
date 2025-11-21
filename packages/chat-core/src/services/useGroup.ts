import { ref } from 'vue';
import { IMSDK } from './useOpenIM';
import { IContactProps, IUserProps } from '../components/interfaces/interfaces';
import { manipulateConversationList } from './useConversions';
import { appendUserAttributes } from '../composables/useUsers';
import { useOpenIMRestApi } from './useApi';

const groups = ref<IContactProps[]>([]);
const groupMembers = ref<IUserProps[]>([]);

export const fetchGroupMembers = async (
  groupID: string
): Promise<IUserProps[]> => {
  try {
    const response = await IMSDK.getGroupMemberList({
      groupID,
      filter: 0,
      offset: 0,
      count: 1000
    });

    const memberIDs = response.data?.map((m: any) => m.userID) ?? [];

    if (memberIDs.length === 0) {
      groupMembers.value = [];
      return groupMembers.value;
    }

    const usersResponse = await IMSDK.getUsersInfo(memberIDs);

    const resultUsers = usersResponse.data ?? [];

    groupMembers.value = resultUsers.map(
      (user: {
        userID: string;
        nickname: string;
        ex: string;
        faceURL: string;
      }) =>
        appendUserAttributes({
          id: user.userID,
          ex: user.ex,
          nickname: user.nickname,
          avatarUrl: user.faceURL
        })
    );

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
  try {
    const res = await IMSDK.createGroup({
      groupInfo: {
        groupType: 2,
        groupName: name,
        faceURL: imageUrl || null
      },
      memberUserIDs
    });

    const group = {
      ...res.data,
      showName: name,
      createdTime: Date.now(),
      conversationID: 'sg_' + res.data.groupID
    };

    groups.value.unshift(...manipulateConversationList([group]));
    return group;
  } catch (err) {
    console.error('Failed to get users with messages:', err);
  }
};

const getGroupList = (): IContactProps[] => {
  return groups.value || [];
};

const setGroupList = (value): void => {
  groups.value = manipulateConversationList(value);
};

const updateGroupList = (value: any[]): void => {
  const newItems = manipulateConversationList(value);

  const conversationMap = new Map(groups.value.map(item => [item.id, item]));

  newItems.forEach(item => {
    conversationMap.set(item.id, { ...conversationMap.get(item.id), ...item });
  });

  groups.value = Array.from(conversationMap.values()).sort((a, b) => {
    if (a.isPin && !b.isPin) return -1;
    if (!a.isPin && b.isPin) return 1;

    return b.latestMessageTime - a.latestMessageTime;
  });
};

const setGroupInfo = async (
  groupID: string,
  groupInfo: Partial<{
    groupName?: string;
    faceURL?: string;
    introduction?: string;
    notification?: string;
    ex?: string;
  }>
) => {
  try {
    await IMSDK.setGroupInfo({ groupID, ...groupInfo });

    const index = groups.value.findIndex(g => g.id === groupID);
    if (index !== -1) {
      const existing = groups.value[index];
      groups.value[index] = {
        ...existing,
        ...groupInfo,
        nickname: groupInfo.groupName || existing.nickname
      };

      groups.value.sort((a, b) => {
        if (a.isPin && !b.isPin) return -1;
        if (!a.isPin && b.isPin) return 1;
        return b.latestMessageTime - a.latestMessageTime;
      });
    }
  } catch (err) {
    console.error('Failed to set group info:', err);
  }
};

const quitGroup = async (groupID: string) => {
  try {
    await IMSDK.quitGroup(groupID);

    groups.value = groups.value.filter(group => group.id !== groupID);
  } catch (err) {
    console.error('Failed to quit group:', err);
    throw err;
  }
};

export const getGroupInfo = async (groupIDs: string[]) => {
  try {
    const api = useOpenIMRestApi();

    const response = await api.post('/group/get_groups_info', {
      groupIDs
    });

    const apiResponse: {
      errCode: number;
      errMsg: string;
      errDlt: string;
      data: {
        groupInfos: any;
      };
    } = await response.json();

    if (apiResponse.errCode !== 0) {
      throw new Error(`${apiResponse.errMsg} (${apiResponse.errDlt})`);
    }

    return apiResponse.data.groupInfos;
  } catch (err) {
    console.error('Failed to get group info:', err);
    throw err;
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
