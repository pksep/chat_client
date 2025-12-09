import { ref } from 'vue';
import { getAuthToken } from './useLogin';
import { useOpenIMRestApi } from '../services/useApi';

import type { IUserProps } from '../components/interfaces/interfaces';
import { SelfUserInfo } from '@openim/wasm-client-sdk';

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
      console.warn('No authentication token found, using empty user list');
      users.value = [];
      return users.value;
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
    return users.value || [];
  } finally {
    loading.value = false;
  }
};

export const appendUserAttributes = (
  user: Partial<IUserProps & SelfUserInfo>
) => {
  if (!user) return null;
  const ex = JSON.parse(user?.ex || null);

  return {
    ...user,
    tabel: ex?.tabel || '',
    initial: ex?.initial || '',
    avatarUrl: user.faceURL,
    id: `${user.id || user.userID}`
  };
};

export const getUsersList = (): IUserProps[] => {
  return users.value || [];
};
