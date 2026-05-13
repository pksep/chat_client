import type { IUser, IUserStatus } from '../components/interfaces/interfaces';
import { getAuthUser, mergeAuthUser } from '../composables/useAuth';
import { updateLocalTopicUser } from '../composables/useTopics';
import { upsertLocalUser } from '../composables/useUsers';
import { getChatSDK } from './useChat';
import { normalizeUserStatus } from '../utils/userStatus';

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

  upsertLocalUser(nextUser);
  updateLocalTopicUser(nextUser.id, nextUser);
  mergeAuthUser(nextUser);

  return nextUser;
};
