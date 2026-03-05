import { ref, shallowRef } from 'vue';
import { getChatSDK } from '../services/useChat';

import type { IUser } from '../components/interfaces/interfaces';

const users = shallowRef<IUser[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

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
  }
};

export const getUserLastOnline = (user: IUser): Date | null => {
  const storeUser = getUserById(user.id);
  return storeUser ? storeUser.lastOnline : user.lastOnline;
};
