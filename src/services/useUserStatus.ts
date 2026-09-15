import type { IUser, IUserStatus } from '../components/interfaces/interfaces';
import { getAuthUser, mergeAuthUser } from '../composables/useAuth';
import { updateLocalTopicUser } from '../composables/useTopics';
import { upsertLocalUser } from '../composables/useUsers';
import { getChatSDK } from './useChat';
import { normalizeUserStatus } from '../utils/userStatus';

const applyUpdatedUser = (user: IUser): IUser => {
  upsertLocalUser(user);
  updateLocalTopicUser(user.id, user);
  mergeAuthUser(user);
  return user;
};

export const updateCurrentUserStatus = async (
  status?: IUserStatus | null
): Promise<IUser> => {
  const sdk = getChatSDK();
  const authUser = getAuthUser() as IUser | null;

  if (!sdk || !authUser?.id) {
    throw new Error('Authorized user is missing');
  }

  const normalizedStatus = normalizeUserStatus(status);
  const updatedUser = (await sdk.updateUserProfile(authUser.id, {
    status: normalizedStatus
  } as Partial<IUser>)) as IUser;

  const nextUser: IUser = {
    ...authUser,
    ...updatedUser,
    status:
      updatedUser.status !== undefined ? updatedUser.status : normalizedStatus
  };

  return applyUpdatedUser(nextUser);
};

export const removeCurrentUserStatusPreset = async (
  status: IUserStatus
): Promise<IUser> => {
  const sdk = getChatSDK();
  const authUser = getAuthUser() as IUser | null;
  const normalizedStatus = normalizeUserStatus(status);
  if (!sdk || !authUser?.id || !normalizedStatus) {
    throw new Error('Не удалось определить пользователя или вариант статуса');
  }

  const updatedUser = await sdk.removeUserStatusPreset(normalizedStatus);
  return applyUpdatedUser({ ...authUser, ...updatedUser });
};
