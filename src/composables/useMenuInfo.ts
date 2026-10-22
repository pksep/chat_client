import { reactive, computed } from 'vue';
import { currentGroup, useGroup } from '../composables/useGroup';
import { getChatSDK } from '../services/useChat';
import { getUsersList } from './useUsers';
import { useTopics } from './useTopics';
import type { ITopic, IUser } from '../components/interfaces/interfaces';
import { TopicType } from '../services/useChatSDK/types';
import { RouteType } from './navigation/useUrlRouting';
import { showErrorNotification } from './useNotifications';

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
  let informationRequest = 0;

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

  const handleUpdateInformation = async (value: IMenuInfoInformation) => {
    if (!value?.groupId && !value?.topicId) {
      showErrorNotification(
        'Не удалось определить чат. Откройте информацию о группе заново.'
      );
      return;
    }
    if (value?.groupId) {
      const { setGroupInfo } = useGroup();
      try {
        await setGroupInfo(value.groupId, {
          groupName: value.name,
          avatarUrl: value.avatarUrl || undefined,
          notification: null,
          ex: undefined
        });
      } catch (error) {
        showErrorNotification(error);
        return;
      }
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
    state.information = value;
  };

  const initializeMenuInfo = async (
    props: Props & {
      isEnabled: boolean;
      topic: { id: string; type: RouteType };
    }
  ) => {
    if (!props.isEnabled) return;

    const request = ++informationRequest;
    state.information = null;
    const sdk = getChatSDK();
    const { getSelectedTopic } = useTopics();
    let findTopic =
      getSelectedTopic(props.topic.id) ||
      (currentGroup.value?.id === props.topic.id
        ? currentGroup.value
        : undefined);
    if (!findTopic) {
      try {
        findTopic = (await sdk.getTopicById(props.topic.id)) as ITopic;
      } catch (error) {
        if (request === informationRequest) showErrorNotification(error);
        return;
      }
    }
    if (request !== informationRequest) return;

    if (findTopic?.type === TopicType.Group && findTopic.group?.id) {
      const topicGroup = findTopic.group;
      // Идентификатор группы уже есть в списке: сбой дополнительного чтения
      // не должен превращать сохранение названия или фото в локальное изменение.
      state.information = {
        name: topicGroup.title || findTopic.name,
        avatarUrl: topicGroup.avatarUrl || findTopic.avatarUrl,
        groupId: topicGroup.id,
        topicId: findTopic.id,
        date: topicGroup.createdAt ? new Date(topicGroup.createdAt) : undefined
      };
      const initialInformation = state.information;
      try {
        const { group } = await sdk.getGroup(topicGroup.id);
        if (
          request !== informationRequest ||
          state.information !== initialInformation ||
          group?.id !== topicGroup.id
        )
          return;
        state.information = {
          ...state.information,
          name: group.title,
          avatarUrl: group.avatarUrl,
          date: group.createdAt ? new Date(group.createdAt) : undefined
        };
      } catch (error) {
        if (request === informationRequest) showErrorNotification(error);
      }
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
