import { ref, shallowRef } from 'vue';
import { getAuthToken } from './useLogin';
import { useOpenIMRestApi } from '../services/useApi';

import type { IUserProps } from '../components/interfaces/interfaces';
import { SelfUserInfo } from '@openim/wasm-client-sdk';

const users = shallowRef<IUserProps[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

let userMapCache: Map<string, IUserProps> | null = null;
let lastUsersUpdate = 0;

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
      userMapCache = new Map();
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
      userMapCache = new Map();
      return users.value;
    }

    const batchSize = 50;
    const processedUsers: IUserProps[] = [];

    for (let i = 0; i < resultUsers.length; i += batchSize) {
      const batch = resultUsers.slice(i, i + batchSize);
      const batchResults = batch.map(
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

      processedUsers.push(...batchResults);
    }

    users.value = processedUsers;
    lastUsersUpdate = Date.now();
    userMapCache = null;

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
  let ex: any = null;

  try {
    ex = user?.ex ? JSON.parse(user.ex) : null;
  } catch (e) {
    console.warn('Failed to parse user ex field:', e);
  }

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

export const getUserById = (userId: string): IUserProps | undefined => {
  if (userMapCache && Date.now() - lastUsersUpdate < 30000) {
    return userMapCache.get(userId);
  }

  userMapCache = new Map(users.value.map(user => [user.id, user]));
  return userMapCache.get(userId);
};
