import { reactive, computed, watch } from 'vue';
import { useGroup } from '../composables/useGroup';
import { getChatSDK } from '../services/useChat';
import { getUsersList } from './useUsers';
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
  contacts: IUser[];
  filteredMembers: IUser[];
  information: IMenuInfoInformation | null;
};

export type IMenuInfoInformation = {
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
    contacts: [],
    filteredMembers: [],
    information: null
  });

  const filteredMembers = computed(() => {
    const allUsers = getUsersList();
    const contactIds = new Set(state.contacts.map(contact => contact.id));
    return allUsers.filter(user => !contactIds.has(user.id));
  });

  watch(
    () => state.contacts,
    () => {
      const allUsers = getUsersList();
      const contactIds = new Set(state.contacts.map(contact => contact.id));
      state.filteredMembers = allUsers.filter(user => !contactIds.has(user.id));
    },
    { deep: true }
  );

  const handleContactClick = (): void => {
    state.openAddUser = true;
  };

  const handleNewContact = async (contacts: IUser[]): Promise<void> => {
    state.contacts = [...state.contacts, ...contacts];

    try {
      const { addGroupMembers, fetchGroupMembers } = useGroup();
      const success = await addGroupMembers(
        state.information.groupId,
        contacts
      );

      if (success) {
        state.contacts = await fetchGroupMembers(state.information.groupId);
      } else {
        console.error('Failed to add users to group');
        state.contacts = await fetchGroupMembers(state.information.groupId);
      }
    } catch (error) {
      console.error('Failed to invite users to group:', error);
      const { fetchGroupMembers } = useGroup();
      state.contacts = await fetchGroupMembers(state.information.groupId);
    }
  };

  const handleUpdateInformation = (value: any) => {
    state.information = value;
    if (state.information?.groupId) {
      const { setGroupInfo } = useGroup();
      setGroupInfo(state.information?.groupId, {
        groupName: state.information?.name,
        faceURL: state.information?.avatarUrl,
        notification: null
      });
    }
  };

  const checkGroupId = computed(
    () =>
      state.information?.groupId === undefined ||
      state.information?.groupId === null ||
      state.information?.groupId === ''
  );

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

    if (findTopic.type === TopicType.Group) {
      const { group, members } = await sdk.getGroup(findTopic.group.id);

      state.contacts = members.data || [];

      state.information = {
        name: group?.title,
        avatarUrl: group?.avatarUrl,
        groupId: group?.id,
        topicId: findTopic.id,
        date: group?.createdAt ? new Date(group.createdAt) : undefined
      };
    }
  };

  const handleCloseAddUserModal = () => {
    state.openAddUser = false;
  };

  return {
    state,
    checkGroupId,
    handleContactClick,
    handleNewContact,
    handleUpdateInformation,
    initializeMenuInfo,
    handleCloseAddUserModal,
    filteredMembers
  };
}
