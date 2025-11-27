import { reactive, computed } from 'vue';
import { fetchGroupMembers, getGroupInfo } from '../services/useGroup';
import { IMSDK } from '../services/useOpenIM';
import { generateChatId } from '../services/useMastra';
import type { IUserProps } from '../components/interfaces/interfaces';

type IMenuInfoProps = {
  open: boolean;
  contact?: IUserProps | null;
  members?: IUserProps[];
};

type IMenuInfoState = {
  openAddUser: boolean;
  contacts: IUserProps[];
  filteredMembers: IUserProps[];
  information: IMenuInfoInformation | null;
};

export type IMenuInfoInformation = {
  name?: string;
  date?: Date;
  groupId?: string | null;
  userId?: string;
  avatarUrl?: string;
};

type IMenuInfoEmits = {
  (e: 'unmount-contact', contact: IUserProps): void;
};

export function useMenuInfo<
  Props extends IMenuInfoProps,
  Emits extends IMenuInfoEmits
>(props: Props & { isEnabled: boolean }, emits: Emits) {
  const state = reactive<IMenuInfoState>({
    openAddUser: false,
    contacts: [],
    filteredMembers: [],
    information: null
  });

  const handleContactClick = (): void => {
    state.openAddUser = true;
  };

  const handleNewContact = (contacts: IUserProps[]): void => {
    if (props.contact?.groupId) {
      state.contacts = [...state.contacts, ...contacts];
      IMSDK.inviteUserToGroup(
        {
          groupID: props.contact?.groupId,
          reason: 'Отправили приглашение',
          userIDList: contacts.map(contact => contact.id)
        },
        generateChatId()
      );
    }
  };

  const handleUpdateInformation = (value: any) => {
    state.information = value;
    if (props.contact?.groupId) {
      IMSDK.setGroupInfo(
        {
          groupID: props.contact?.groupId,
          groupName: state.information?.name,
          faceURL: state.information?.avatarUrl,
          notification: null
        },
        generateChatId()
      );
    }
    emits('unmount-contact', {
      ...props.contact,
      nickname: state.information?.name,
      avatarUrl: state.information?.avatarUrl
    });
  };

  const checkGroupId = computed(
    () =>
      props.contact?.groupId === undefined ||
      props.contact?.groupId === null ||
      props.contact?.groupId === ''
  );

  const initializeMenuInfo = async (props: Props & { isEnabled: boolean }) => {
    if (!props.isEnabled) return;
    if (props.contact?.id && checkGroupId.value) {
      state.contacts = [props.contact];
      state.information = {
        userId: props.contact?.id
      };
    } else if (props.contact) {
      state.contacts = await fetchGroupMembers(props.contact?.groupId);
      const groups = await getGroupInfo([props.contact?.groupId]);
      state.filteredMembers = props.members.filter(
        item => !state.contacts.some(contact => contact.id === item.id)
      );
      let date = new Date();
      if (groups?.length > 0 && groups[0]?.createTime) {
        date = new Date(groups[0]?.createTime);
      }
      state.information = {
        groupId: props.contact?.groupId,
        date
      };

      state.information = {
        userId: state.information.userId,
        groupId: state.information.groupId || null,
        date: state.information.date,
        name: props.contact.nickname || '',
        avatarUrl: props.contact.avatarUrl
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
    handleCloseAddUserModal
  };
}
