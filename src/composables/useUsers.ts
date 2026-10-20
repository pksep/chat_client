import { computed, ref, shallowRef } from 'vue';
import { getChatSDK } from '../services/useChat';
import { getConfig } from '../services/useConfig';
import { fetchWithAuthRedirect } from './useAuth';

import type { IUser, IUserStatus } from '../components/interfaces/interfaces';
import {
  loadCachedUsers,
  saveCachedUsers
} from '../services/useChatStateCache';
import { normalizeDateValue } from '../utils/dateValue';
import { isDeletedBotUser, isLocalBotUser } from '../utils/bot';
import { filterVisibleUsers } from '../utils/user-directory';
import { nativeStartupReadStartedAt } from '../services/native-startup-reads';

const users = shallowRef<IUser[]>([]);
const directoryUsers = shallowRef<IUser[]>([]);
const usersById = computed(() => {
  const index = new Map<string, IUser>();
  // Скрытые дубликаты справочника всё ещё могут быть участниками старых чатов.
  for (const user of [...users.value, ...directoryUsers.value]) {
    if (!index.has(user.id)) index.set(user.id, user);
  }
  return index;
});
const loading = ref(false);
const error = ref<string | null>(null);
let persistUsersTimeout: ReturnType<typeof setTimeout> | null = null;
const freshPresenceIds = shallowRef(new Set<string>());
const userRevisions = new Map<string, number>();
const userUpdatedAt = new Map<string, number>();
const presenceChanges = new Map<string, { revision: number; at: number }>();
const statusChanges = new Map<string, { revision: number; at: number }>();
let usersRequest:
  | { sdk: ReturnType<typeof getChatSDK>; key: string; task: Promise<IUser[]> }
  | undefined;

const markUserUpdated = (
  userId: string,
  hasPresence = false,
  hasStatus = false
): void => {
  const revision = (userRevisions.get(userId) || 0) + 1;
  const at = Date.now();
  userRevisions.set(userId, revision);
  userUpdatedAt.set(userId, at);
  if (hasPresence) presenceChanges.set(userId, { revision, at });
  if (hasStatus) statusChanges.set(userId, { revision, at });
  if (hasPresence)
    freshPresenceIds.value = new Set([...freshPresenceIds.value, userId]);
};

const mergeUserWithStoredFields = (
  incomingUser: IUser,
  existingUser?: IUser
): IUser => {
  if (!existingUser) {
    return incomingUser;
  }

  return {
    ...existingUser,
    ...incomingUser,
    lastOnline:
      incomingUser.lastOnline !== undefined
        ? incomingUser.lastOnline
        : existingUser.lastOnline,
    status:
      incomingUser.status !== undefined
        ? incomingUser.status
        : existingUser.status
  };
};

const mergeUsersWithStoredFields = (incomingUsers: IUser[]): IUser[] => {
  const currentUsersById = usersById.value;

  return incomingUsers.map(incomingUser =>
    mergeUserWithStoredFields(
      incomingUser,
      currentUsersById.get(incomingUser.id)
    )
  );
};

const schedulePersistUsers = () => {
  if (persistUsersTimeout) {
    clearTimeout(persistUsersTimeout);
  }

  persistUsersTimeout = setTimeout(() => {
    persistUsersTimeout = null;
    void saveCachedUsers(
      directoryUsers.value.length ? directoryUsers.value : users.value
    );
  }, 150);
};

export const hydrateUsersFromCache = async (
  userId?: string
): Promise<IUser[]> => {
  if (users.value.length > 0) {
    return [...users.value];
  }

  const usersBeforeLoad = users.value;
  const cachedUsers = await loadCachedUsers(userId);

  // Поздний кеш не должен затирать обновление с сервера или сброс справочника.
  if (cachedUsers.length > 0) {
    directoryUsers.value =
      users.value === usersBeforeLoad
        ? cachedUsers
        : [
            ...usersById.value.values(),
            ...cachedUsers.filter(user => !usersById.value.has(user.id))
          ];
    users.value = filterVisibleUsers(directoryUsers.value);
  }

  return [...users.value];
};

export const fetchAllUsers = (page = 1, limit = 200): Promise<IUser[]> => {
  const sdk = getChatSDK();
  const key = `${page}:${limit}`;
  if (usersRequest?.sdk === sdk && usersRequest.key === key)
    return usersRequest.task;
  loading.value = true;
  error.value = null;
  const revisions = new Map(userRevisions);
  const task = Promise.resolve().then(async () => {
    try {
      if (!sdk) return users.value;
      const response = await sdk.getUsers({ page, limit });
      const preparedAt = nativeStartupReadStartedAt(response);
      const incoming = [...response.data];
      // Прежние страницы не должны оставлять старые статусы сотрудников за пределами первых 200.
      const totalPages = response.meta?.totalPages ?? response.totalPages ?? 1;
      if (page === 1) {
        for (let next = 2; next <= totalPages; next++) {
          if (getChatSDK() !== sdk) return users.value;
          const result = await sdk.getUsers({ page: next, limit });
          incoming.push(...result.data);
          if (!result.data.length) break;
        }
      }
      if (getChatSDK() !== sdk) return users.value;
      const freshIds = new Set(freshPresenceIds.value);
      const mergedUsers = mergeUsersWithStoredFields(incoming).map(user => {
        const isNewerField = (change?: { revision: number; at: number }) =>
          !!change &&
          (change.revision > (revisions.get(user.id) || 0) ||
            (preparedAt !== undefined && change.at >= preparedAt));
        const newerPresence = isNewerField(presenceChanges.get(user.id));
        const newerStatus = isNewerField(statusChanges.get(user.id));
        if (!newerPresence && user.lastOnline !== undefined)
          freshIds.add(user.id);
        // WS, пришедший во время HTTP, уже содержит более свежее присутствие/статус.
        if (
          userRevisions.get(user.id) !== revisions.get(user.id) ||
          (preparedAt !== undefined &&
            (userUpdatedAt.get(user.id) || 0) >= preparedAt)
        ) {
          const current = getUserById(user.id);
          if (!current) return user;
          // Частичное событие статуса не отменяет свежее присутствие из HTTP,
          // а событие присутствия не отменяет актуальный статус сотрудника.
          return {
            ...user,
            ...current,
            ...(!newerPresence && user.lastOnline !== undefined
              ? { lastOnline: user.lastOnline }
              : {}),
            ...(!newerStatus && user.status !== undefined
              ? { status: user.status }
              : {})
          };
        }
        return user;
      });
      const mergedIds = new Set(mergedUsers.map(user => user.id));
      const localBotUsers = (users.value || []).filter(
        user => isLocalBotUser(user) && !mergedIds.has(user.id)
      );

      directoryUsers.value = [...mergedUsers, ...localBotUsers];
      users.value = filterVisibleUsers(directoryUsers.value);
      freshPresenceIds.value = freshIds;
      schedulePersistUsers();

      return users.value;
    } catch (err) {
      error.value = (err as Error).message;
      console.error('Failed to fetch users:', error.value);
      return users.value || [];
    } finally {
      if (usersRequest?.task === task) {
        loading.value = false;
        usersRequest = undefined;
      }
    }
  });
  usersRequest = { sdk, key, task };
  return task;
};

export const getUsersList = (): IUser[] => users.value;
export const getUsersRefreshFailed = (): boolean => !!error.value;
export const invalidateUserPresence = (): void => {
  freshPresenceIds.value = new Set();
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
    const response = await fetchWithAuthRedirect(
      `${apiUrl}/users/login-options?${queryParams.toString()}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch users: ${response.status}`);
    }

    const data = (await response.json()) as { data?: IUser[] };
    directoryUsers.value = data.data || [];
    users.value = filterVisibleUsers(directoryUsers.value);
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
  return usersById.value.get(userId);
};

export const updateLocalUserStatus = (
  userId: string,
  lastOnline: Date | string | null | undefined,
  status?: IUserStatus | null
): void => {
  const currentUsers = users.value || [];
  markUserUpdated(userId, lastOnline !== undefined, status !== undefined);
  directoryUsers.value = directoryUsers.value.map(user =>
    user.id === userId
      ? {
          ...user,
          ...(lastOnline !== undefined
            ? { lastOnline: normalizeDateValue(lastOnline) }
            : {}),
          ...(status !== undefined ? { status } : {})
        }
      : user
  );
  schedulePersistUsers();
  const index = currentUsers.findIndex(u => u.id === userId);

  if (index !== -1) {
    const updatedUsers = [...currentUsers];
    updatedUsers[index] = {
      ...updatedUsers[index],
      ...(lastOnline !== undefined
        ? { lastOnline: normalizeDateValue(lastOnline) }
        : {}),
      ...(status !== undefined ? { status } : {})
    };
    users.value = updatedUsers;
    schedulePersistUsers();
  }
};

export const updateLocalUserIsOnline = (userId: string): void => {
  updateLocalUserStatus(userId, null);
};

export const upsertLocalUser = (user: IUser): void => {
  if (!user?.id) {
    return;
  }
  markUserUpdated(
    user.id,
    user.lastOnline !== undefined,
    user.status !== undefined
  );

  if (isDeletedBotUser(user)) {
    removeLocalUser(user.id);
    return;
  }

  const currentUsers = users.value || [];
  const existingDirectoryUser = usersById.value.get(user.id);
  directoryUsers.value = [
    ...directoryUsers.value.filter(item => item.id !== user.id),
    mergeUserWithStoredFields(user, existingDirectoryUser)
  ];
  const index = currentUsers.findIndex(item => item.id === user.id);

  if (index === -1) {
    users.value = filterVisibleUsers([...currentUsers, user]);
    schedulePersistUsers();
    return;
  }

  const nextUsers = [...currentUsers];
  nextUsers[index] = mergeUserWithStoredFields(user, nextUsers[index]);
  users.value = filterVisibleUsers(nextUsers);
  schedulePersistUsers();
};

export const removeLocalUser = (userId?: string | number | null): void => {
  if (!userId) {
    return;
  }

  const currentUsers = users.value || [];
  directoryUsers.value = directoryUsers.value.filter(
    user => user.id !== userId
  );
  schedulePersistUsers();
  const nextUsers = currentUsers.filter(user => user.id !== userId);

  if (nextUsers.length === currentUsers.length) {
    return;
  }

  users.value = nextUsers;
  schedulePersistUsers();
};

export const getUserLastOnline = (user: IUser): Date | null | undefined => {
  const storeUser = getUserById(user.id);
  const lastOnline =
    storeUser?.lastOnline !== undefined
      ? storeUser.lastOnline
      : user.lastOnline;
  // null означает онлайн только после подтверждения в текущем запуске.
  return lastOnline === null && !freshPresenceIds.value.has(user.id)
    ? undefined
    : lastOnline;
};
