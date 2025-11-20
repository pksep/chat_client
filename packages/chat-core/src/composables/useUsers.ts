import { ref } from 'vue';
import { getAuthToken } from './useLogin';
import { useOpenIMRestApi } from '../services/useApi';

import type { IUserProps } from '../components/interfaces/interfaces';
import { IMSDK } from '../services/useOpenIM';

const users = ref<IUserProps[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

export const fetchAllUsers = async (opts?: {
  pageNumber?: number;
  showNumber?: number;
}): Promise<IUserProps[]> => {
  loading.value = true;
  error.value = null;

  try {
    const token = getAuthToken();
    if (!token) {
      throw new Error('No authentication token found in cookies');
    }

    const api = useOpenIMRestApi();
    const body = {
      pagination: {
        pageNumber: opts?.pageNumber ?? 1,
        showNumber: opts?.showNumber ?? 100
      }
    };

    const response = await api.post(`/user/get_users`, body);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    const resultUsers = result.data?.users ?? [];

    if (resultUsers.length === 0) {
      users.value = [];
      error.value = 'No users found';
      return users.value;
    }

    users.value = resultUsers.map(
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

    return users.value;
  } catch (err) {
    error.value = (err as Error).message;
    console.error('Failed to fetch users:', error.value);
    return [];
  } finally {
    loading.value = false;
  }
};

/*
  const fetchUsersOfGroup = async (
    groupID: string,
    userIDList: string[]
  ): Promise<IUserProps[]> => {
    loading.value = true;
    error.value = null;

    try {
      const response = await IMSDK.getUsersInGroup({ groupID, userIDList });

      const memberIDs = response.data ?? [];

      if (memberIDs.length === 0) {
        users.value = [];
        error.value = 'No users found';
        return users.value;
      }



      // const usersResponse = await IMSDK.getUsersInfo({ userIDList });
      // const resultUsers = usersResponse.data ?? [];

      users.value = resultUsers.map(
        (user: { userID: string; nickname: string; faceURL: string }) => ({
          id: user.userID,
          name: user.nickname,
          nickname: user.nickname,
          avatarUrl: user.faceURL
        })
      );

      return users.value;
    } catch (err) {
      error.value = (err as Error).message;
      console.error('Failed to fetch users of group:', error.value);
      return [];
    } finally {
      loading.value = false;
    }
  };
  */

export const fetchGroupMembers = async (
  groupID: string
): Promise<IUserProps[]> => {
  loading.value = true;
  error.value = null;

  try {
    const response = await IMSDK.getGroupMemberList({
      groupID,
      filter: 0,
      offset: 0,
      count: 1000
    });

    const memberIDs = response.data?.map((m: any) => m.userID) ?? [];

    if (memberIDs.length === 0) {
      users.value = [];
      error.value = 'No members found';
      return users.value;
    }

    const usersResponse = await IMSDK.getUsersInfo(memberIDs);

    const resultUsers = usersResponse.data ?? [];

    users.value = resultUsers.map(
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

    return users.value;
  } catch (err) {
    error.value = (err as Error).message;
    console.error('Failed to fetch group members:', error.value);
    return [];
  } finally {
    loading.value = false;
  }
};

export const appendUserAttributes = (user: IUserProps) => {
  const ex = JSON.parse(user?.ex || null);
  user.tabel = ex?.tabel || '';
  user.initial = ex?.initial || '';
  return user;
};

export const getUsersList = (): IUserProps[] => {
  return users.value || [];
};
