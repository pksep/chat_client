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

  const handleNewContact = async (contacts: IUserProps[]): Promise<void> => {
    if (props.contact?.groupId) {
      state.contacts = [...state.contacts, ...contacts];

      try {
        await IMSDK.inviteUserToGroup(
          {
            groupID: props.contact?.groupId,
            reason: 'Sent invitation',
            userIDList: contacts.map(contact => contact.id)
          },
          generateChatId()
        );

        state.contacts = await fetchGroupMembers(props.contact?.groupId);
      } catch (error) {
        console.error('Failed to invite users to group:', error);
        state.contacts = await fetchGroupMembers(props.contact?.groupId);
      }
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
      ).catch(error => {
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
      const freshGroupInfo = groups?.[0];
      state.information = {
        userId: state.information?.userId || props.contact?.id,
        groupId: props.contact?.groupId,
        date,
        name:
          state.information?.name ||
          freshGroupInfo?.groupName ||
          props.contact.nickname ||
          '',
        avatarUrl:
          state.information?.avatarUrl ||
          freshGroupInfo?.faceURL ||
          props.contact.avatarUrl
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
