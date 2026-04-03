import { ref, shallowRef } from 'vue';
import { getChatSDK } from '../services/useChat';
import { getConfig } from '../services/useConfig';

import type { IUser } from '../components/interfaces/interfaces';
import {
  loadCachedUsers,
  saveCachedUsers
} from '../services/useChatStateCache';

const users = shallowRef<IUser[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
let persistUsersTimeout: ReturnType<typeof setTimeout> | null = null;

const schedulePersistUsers = () => {
  if (persistUsersTimeout) {
    clearTimeout(persistUsersTimeout);
  }

  persistUsersTimeout = setTimeout(() => {
    persistUsersTimeout = null;
    void saveCachedUsers(users.value || []);
  }, 150);
};

export const hydrateUsersFromCache = async (
  userId?: string
): Promise<IUser[]> => {
  if (users.value.length > 0) {
    return [...users.value];
  }

  const cachedUsers = await loadCachedUsers(userId);

  if (cachedUsers.length > 0) {
    users.value = [...cachedUsers];
  }

  return [...users.value];
};

export const fetchAllUsers = async (
  page = 1,
  limit = 200
): Promise<IUser[]> => {
  loading.value = true;
  error.value = null;

  try {
    const sdk = getChatSDK();
    const response = await sdk.getUsers({
      page,
      limit
    });

    users.value = [...response.data];
    schedulePersistUsers();

    return users.value;
  } catch (err) {
    error.value = (err as Error).message;
    console.error('Failed to fetch users:', error.value);
    return users.value || [];
  } finally {
    loading.value = false;
  }
};

export const getUsersList = (): IUser[] => {
  const currentUsers = users.value || [];

  return [...currentUsers];
};

export const fetchUsersForAuth = async (
  page = 1,
  limit = 200
): Promise<IUser[]> => {
  loading.value = true;
  error.value = null;

  try {
    const config = getConfig();
    const apiUrl = config.CHAT_API_DOMAIN;

    if (!apiUrl) {
      return users.value || [];
    }

    const queryParams = new URLSearchParams({
      page: String(page),
      limit: String(limit)
    });
    const response = await fetch(
      `${apiUrl}/users/login-options?${queryParams.toString()}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch users: ${response.status}`);
    }

    const data = (await response.json()) as { data?: IUser[] };
    users.value = [...(data.data || [])];
    schedulePersistUsers();

    return users.value;
  } catch (err) {
    error.value = (err as Error).message;
    console.error('Failed to fetch auth users:', error.value);
    return users.value || [];
  } finally {
    loading.value = false;
  }
};

export const getUserById = (userId: string): IUser | undefined => {
  const currentUsers = users.value || [];
  return currentUsers.find(user => user.id === userId);
};

export const updateLocalUserStatus = (
  userId: string,
  lastOnline: Date | null
): void => {
  const currentUsers = users.value || [];
  const index = currentUsers.findIndex(u => u.id === userId);

  if (index !== -1) {
    const updatedUsers = [...currentUsers];
    updatedUsers[index] = {
      ...updatedUsers[index],
      lastOnline
    };
    users.value = updatedUsers;
    schedulePersistUsers();
  }
};

export const updateLocalUserIsOnline = (userId: string): void => {
  const currentUsers = users.value || [];
  const index = currentUsers.findIndex(u => u.id === userId);

  if (index !== -1) {
    const updatedUsers = [...currentUsers];
    updatedUsers[index] = {
      ...updatedUsers[index],
      lastOnline: updatedUsers[index].lastOnline
    };
    users.value = updatedUsers;
    schedulePersistUsers();
  }
};

export const getUserLastOnline = (user: IUser): Date | null => {
  const storeUser = getUserById(user.id);
  return storeUser ? storeUser.lastOnline : user.lastOnline;
};
