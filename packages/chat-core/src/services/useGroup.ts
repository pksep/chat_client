import { ref } from 'vue';
import { IMSDK } from './useOpenIM';
import { IContactProps } from '../components/interfaces/interfaces';
import { manipulateConversationList } from './useConversions';

const groups = ref<IContactProps[]>([]);

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

    groups.value.unshift(
      ...manipulateConversationList([
        {
          ...res.data,
          showName: name,
          createdTime: Date.now(),
          conversationID: 'sg_' + res.data.groupID
        }
      ])
    );
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

export {
  createGroup,
  getGroupList,
  setGroupList,
  updateGroupList,
  setGroupInfo,
  quitGroup
};
