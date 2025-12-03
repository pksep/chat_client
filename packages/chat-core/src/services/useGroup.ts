import { ref } from 'vue';
import { IMSDK } from './useOpenIM';
import { IContactProps, IUserProps } from '../components/interfaces/interfaces';
import {
  manipulateConversationList,
  updateConversationList
} from './useConversions';
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

    // Explicitly get/create the conversation for the new group
    let conv: any = null;
    try {
      const convRes = await IMSDK.getOneConversation({
        sourceID: res.data.groupID,
        sessionType: 2 // Group chat
      });
      conv = convRes.data;
      console.debug(
        '[OpenIM] New group conversation fetched:',
        conv.conversationID
      );
    } catch (convErr) {
      console.warn(
        '[OpenIM] Failed to fetch new conv, using optimistic:',
        convErr
      );
      // Fallback: Create optimistic conv
      conv = {
        conversationID: `sg_${res.data.groupID}`,
        groupID: res.data.groupID,
        showName: name,
        faceURL: imageUrl || '',
        latestMsgSendTime: Date.now(),
        unreadCount: 0,
        isPinned: false
      };
    }

    // Update local stores
    const groupItem = manipulateConversationList([conv])[0];
    groups.value.unshift(groupItem);
    updateConversationList([conv]); // Sync to conversations store

    // Return merged group + conv for downstream use (includes conversationID)
    const fullGroup = {
      ...res.data,
      ...conv,
      conversationID: conv.conversationID // Ensure it's set
    };
    console.debug(
      '[OpenIM] Returning full group with conv ID:',
      fullGroup.conversationID
    );
    return fullGroup;
  } catch (err) {
    console.error('Failed to create group:', err);
    throw err;
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

export const fetchGroupMemberCount = async (
  groupID: string
): Promise<number> => {
  try {
    const groupInfos = await getGroupInfo([groupID]);
    if (groupInfos && groupInfos.length > 0) {
      return groupInfos[0].memberCount || 0;
    }
    return 0;
  } catch (err) {
    console.error('Failed to fetch group member count:', err);
    return 0;
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
