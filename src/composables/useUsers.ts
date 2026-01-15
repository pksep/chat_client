import { ref, shallowRef } from 'vue';
import { getChatSDK } from '../services/useChat';

import type { IUser } from '../components/interfaces/interfaces';

const users = shallowRef<IUser[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

let userMapCache: Map<string, IUser> | null = null;
let lastUsersUpdate = 0;

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

    users.value = response.data;

    lastUsersUpdate = Date.now();

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
  return users.value || [];
};

export const getUserById = (userId: string): IUser | undefined => {
  if (userMapCache && Date.now() - lastUsersUpdate < 30000) {
    return userMapCache.get(userId);
  }

  userMapCache = new Map(users.value.map(user => [user.id, user]));
  return userMapCache.get(userId);
};
