import { ref } from 'vue';
import { IMSDK } from './useOpenIM';
import { IContactProps } from '../components/interfaces/interfaces';
import { manipulateConversationList } from './useConversions';

const groups = ref<IContactProps[]>([]);

const createGroup = async (memberUserIDs: string[], name: string) => {
  try {
    const response = await IMSDK.createGroup({
      groupInfo: {
        groupType: 2,
        groupName: name
      },
      memberUserIDs
    });

    const result = response.data || [];

    setGroupList(result);
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
    return b.latestMessageTime - a.latestMessageTime;
  });
};

export { createGroup, getGroupList, setGroupList, updateGroupList };
