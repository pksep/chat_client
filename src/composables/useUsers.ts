import { ref, shallowRef } from 'vue';
import { getAuthToken } from './useLogin';
import { getChatSDK } from '../services/useChat';

import type { IUserProps } from '../components/interfaces/interfaces';
import type { User } from '../services/useChatSDK/types';

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

    const sdk = getChatSDK();
    const response = await sdk.getUsers({
      page: opts?.pageNumber ?? 1,
      limit: opts?.showNumber ?? 100
    });
    console.log(response.data);
    const resultUsers = response.data ?? [];

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
      const batchResults = batch.map((user: User) =>
        appendUserAttributes({
          id: user.id,
          nickname: user.nickname,
          avatarUrl: user.avatarUrl
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

export const appendUserAttributes = (user: Partial<IUserProps & User>) => {
  if (!user) return null;

  return {
    ...user,
    tabel: user.tabel || '',
    initial: user.initial || (user as User).initials || '',
    avatarUrl: user.avatarUrl || '',
    id: `${user.id || ''}`
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
