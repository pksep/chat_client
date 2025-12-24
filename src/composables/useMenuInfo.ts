import { reactive, computed } from 'vue';
import {
  fetchGroupMembers,
  getGroupInfo,
  setGroupInfo
} from '../services/useGroup';
import { IMSDK } from '../services/useOpenIM';
import { generateChatId } from '../services/useChatDb';
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

  const handleNewContact = async (contacts: IUserProps[]): Promise<void> => {
    state.contacts = [...state.contacts, ...contacts];

    try {
      await IMSDK.inviteUserToGroup(
        {
          groupID: state.information.groupId,
          reason: 'Sent invitation',
          userIDList: contacts.map(contact => contact.id)
        },
        generateChatId()
      );

      state.contacts = await fetchGroupMembers(state.information.groupId);
    } catch (error) {
      console.error('Failed to invite users to group:', error);
      state.contacts = await fetchGroupMembers(state.information.groupId);
    }
  };

  const handleUpdateInformation = (value: any) => {
    state.information = value;
    if (state.information?.groupId) {
      setGroupInfo(state.information?.groupId, {
        groupName: state.information?.name,
        faceURL: state.information?.avatarUrl,
        notification: null
      }).catch(error => {
        const errorDetails = {
          error: error,
          operation: 'setGroupInfo',
          groupID: props.contact?.groupId,
          timestamp: new Date().toISOString(),
          operationID: error?.operationID || error?.data?.operationID || null,
          event: error?.event || error?.data?.event || null,
          errorMessage: error?.errorMessage || error?.message || 'Unknown error'
        };

        console.error('Failed to update group info:', errorDetails);

        if (error?.operationID) {
          console.info(`Operation ID: ${error.operationID}`);
        }
        if (error?.event) {
          console.info(`Event: ${error.event}`);
        }
      });
    }

    emits('unmount-contact', {
      ...state.information,
      nickname: state.information?.name,
      avatarUrl: state.information?.avatarUrl
    });
  };

  const checkGroupId = computed(
    () =>
      state.information?.groupId === undefined ||
      state.information?.groupId === null ||
      state.information?.groupId === ''
  );

  const initializeMenuInfo = async (props: Props & { isEnabled: boolean }) => {
    if (!props.isEnabled) return;
    if (props.contact?.id && checkGroupId.value) {
      if (props.contact) {
        state.contacts = [props.contact];
        state.information = {
          userId: props.contact.id
        };
      }
    }
    if (props.contact?.groupId) {
      const groupId = props.contact.groupId;
      if (groupId) {
        state.contacts = await fetchGroupMembers(groupId);
        const groups = await getGroupInfo([groupId]);
        state.filteredMembers =
          props.members?.filter(
            item => !state.contacts.some(contact => contact.id === item.id)
          ) || [];
        let date = new Date();
        if (groups?.length > 0 && groups[0]?.createTime) {
          date = new Date(groups[0].createTime);
        }
        state.information = {
          ...props.contact,
          userId: props.contact.id,
          groupId: groupId,
          date,
          name: props.contact.nickname || '',
          avatarUrl: props.contact.avatarUrl
        };
      }
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
