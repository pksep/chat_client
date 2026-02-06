import { reactive, computed } from 'vue';
import { currentGroup, useGroup } from '../composables/useGroup';
import { getChatSDK } from '../services/useChat';
import { getUsersList } from './useUsers';
import { useTopics } from './useTopics';
import type { IUser } from '../components/interfaces/interfaces';
import { TopicType } from '../services/useChatSDK/types';
import { RouteType } from './navigation/useUrlRouting';

type IMenuInfoProps = {
  open: boolean;
  contact?: IUser | null;
  members?: IUser[];
};

type IMenuInfoState = {
  openAddUser: boolean;
  information: IMenuInfoInformation | null;
};

export type IMenuInfoInformation = {
  id?: string;
  name?: string;
  date?: Date;
  groupId?: string | null;
  userId?: string;
  avatarUrl?: string;
  topicId?: string;
};

export type IMenuInfoEmits = {
  (e: 'unmount-collapse', isCollapse: boolean): void;
  (e: 'unmount-new-contact', config: { isChapterOpen?: boolean }): void;
};

export function useMenuInfo<Props extends IMenuInfoProps>() {
  const state = reactive<IMenuInfoState>({
    openAddUser: false,
    information: null
  });

  const computedFilteredMembers = computed(() => {
    const allUsers = getUsersList();
    const memberIds = new Set(
      currentGroup.value?.members.map(member => member.id) || []
    );
    return allUsers.filter(user => !memberIds.has(user.id));
  });

  const handleContactClick = (): void => {
    state.openAddUser = true;
  };

  const handleUpdateInformation = (value: IMenuInfoInformation) => {
    state.information = value;

    if (value?.groupId) {
      const { setGroupInfo } = useGroup();
      setGroupInfo(value.groupId, {
        groupName: value.name,
        avatarUrl: value.avatarUrl || undefined,
        notification: null,
        ex: undefined
      });
    } else if (value?.topicId) {
      const { topics } = useTopics();
      const topicIndex = topics.value.findIndex(t => t.id === value.topicId);
      if (topicIndex !== -1) {
        const updatedTopic = { ...topics.value[topicIndex] };
        if (value.name) updatedTopic.name = value.name;
        if (value.avatarUrl) updatedTopic.avatarUrl = value.avatarUrl;

        const updatedTopics = [...topics.value];
        updatedTopics[topicIndex] = updatedTopic;
        topics.value = updatedTopics;
      }
    }
  };

  const initializeMenuInfo = async (
    props: Props & {
      isEnabled: boolean;
      topic: { id: string; type: RouteType };
    }
  ) => {
    if (!props.isEnabled) return;

    const sdk = getChatSDK();
    const topics = await sdk.getTopics(
      props.topic.type === 'group' ? TopicType.Group : TopicType.DM
    );
    const findTopic = topics.data.find(to => to.id === props.topic.id);

    if (findTopic?.type === TopicType.Group) {
      const { group } = await sdk.getGroup(findTopic.group.id);

      state.information = {
        name: group?.title,
        avatarUrl: group?.avatarUrl,
        groupId: group?.id,
        topicId: findTopic.id,
        date: group?.createdAt ? new Date(group.createdAt) : undefined
      };
    } else if (findTopic?.type === TopicType.DM) {
      state.information = {
        name:
          findTopic.user?.nickname ||
          (findTopic.user as Record<string, any>)?.['name'],
        avatarUrl: (findTopic.user as Record<string, any>)?.['avatarUrl'],
        userId: findTopic.user?.id,
        topicId: findTopic.id
      };
    }
  };

  const handleCloseAddUserModal = () => {
    state.openAddUser = false;
  };

  return {
    state,
    handleContactClick,
    handleUpdateInformation,
    initializeMenuInfo,
    handleCloseAddUserModal,
    filteredMembers: computedFilteredMembers
  };
}
