import { ref } from 'vue';
import { IMSDK } from './useOpenIM';
import { IContactProps, IUserProps } from '../components/interfaces/interfaces';
import {
  manipulateConversationList,
  updateConversationList
} from './useConversions';
import { appendUserAttributes } from '../composables/useUsers';
import { useOpenIMRestApi } from './useApi';
import { updateItemList } from '../utils/listUtils';

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
    const errorDetails = {
      error: err,
      operation: 'getGroupMemberList',
      timestamp: new Date().toISOString(),
      operationID: err?.operationID || err?.data?.operationID || null,
      event: err?.event || err?.data?.event || null,
      errorMessage: err?.errorMessage || err?.message || 'Unknown error'
    };

    console.error('Failed to fetch group members:', errorDetails);

    if (err?.operationID) {
      console.info(`Operation ID: ${err.operationID}`);
    }
    if (err?.event) {
      console.info(`Event: ${err.event}`);
    }

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

    const groupItem = manipulateConversationList([conv])[0];
    groups.value.unshift(groupItem);
    updateConversationList([conv]); // Sync to conversations store

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
    const errorDetails = {
      error: err,
      operation: 'createGroup',
      timestamp: new Date().toISOString(),
      operationID: err?.operationID || err?.data?.operationID || null,
      event: err?.event || err?.data?.event || null,
      errorMessage: err?.errorMessage || err?.message || 'Unknown error'
    };

    console.error('Failed to create group:', errorDetails);

    if (err?.operationID) {
      console.info(`Operation ID: ${err.operationID}`);
    }
    if (err?.event) {
      console.info(`Event: ${err.event}`);
    }

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
  groups.value = updateItemList(groups.value, newItems);
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
    const errorDetails = {
      error: err,
      operation: 'setGroupInfo',
      groupID,
      timestamp: new Date().toISOString(),
      operationID: err?.operationID || err?.data?.operationID || null,
      event: err?.event || err?.data?.event || null,
      errorMessage: err?.errorMessage || err?.message || 'Unknown error'
    };

    console.error('Failed to set group info:', errorDetails);

    if (err?.operationID) {
      console.info(`Operation ID: ${err.operationID}`);
    }
    if (err?.event) {
      console.info(`Event: ${err.event}`);
    }
  }
};

const quitGroup = async (groupID: string) => {
  try {
    await IMSDK.quitGroup(groupID);

    groups.value = groups.value.filter(group => group.id !== groupID);
  } catch (err) {
    const errorDetails = {
      error: err,
      operation: 'quitGroup',
      groupID,
      timestamp: new Date().toISOString(),
      operationID: err?.operationID || err?.data?.operationID || null,
      event: err?.event || err?.data?.event || null,
      errorMessage: err?.errorMessage || err?.message || 'Unknown error'
    };

    console.error('Failed to quit group:', errorDetails);

    if (err?.operationID) {
      console.info(`Operation ID: ${err.operationID}`);
    }
    if (err?.event) {
      console.info(`Event: ${err.event}`);
    }

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
    const errorDetails = {
      error: err,
      operation: 'get_groups_info',
      timestamp: new Date().toISOString(),
      operationID: err?.operationID || err?.data?.operationID || null,
      event: err?.event || err?.data?.event || null,
      errorMessage: err?.errorMessage || err?.message || 'Unknown error'
    };

    console.error('Failed to get group info:', errorDetails);

    if (err?.operationID) {
      console.info(`Operation ID: ${err.operationID}`);
    }
    if (err?.event) {
      console.info(`Event: ${err.event}`);
    }

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
    const errorDetails = {
      error: err,
      operation: 'fetchGroupMemberCount',
      timestamp: new Date().toISOString(),
      operationID: err?.operationID || err?.data?.operationID || null,
      event: err?.event || err?.data?.event || null,
      errorMessage: err?.errorMessage || err?.message || 'Unknown error'
    };

    console.error('Failed to fetch group member count:', errorDetails);

    if (err?.operationID) {
      console.info(`Operation ID: ${err.operationID}`);
    }
    if (err?.event) {
      console.info(`Event: ${err.event}`);
    }

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
