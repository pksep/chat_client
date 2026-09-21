import type { IUser } from '../../src/components/interfaces/interfaces';
import { isDeletedBotUser } from '../../src/utils/bot';
import { compactPersonName } from '../../src/utils/personName';
import { parseUserEx } from '../../src/utils/parseUserEx';

const normalizeUserDisplayName = (user: IUser): IUser =>
  user.isBot
    ? user
    : {
        ...user,
        initials: compactPersonName(user.initials)
      };

const getCanonicalUserScore = (user: IUser): number => {
  const ex = parseUserEx(user.ex) as ReturnType<typeof parseUserEx> & {
    erpUserId?: string | number;
  };

  return (
    (ex.erpUserId !== undefined && ex.erpUserId !== null ? 4 : 0) +
    (/^\d+$/.test(user.nickname || '') ? 2 : 0)
  );
};

const areLikelyDuplicateUsers = (left: IUser, right: IUser): boolean => {
  if (left.isBot || right.isBot || left.initials !== right.initials) {
    return false;
  }

  const hasSameAvatar =
    !!left.avatarUrl && !!right.avatarUrl && left.avatarUrl === right.avatarUrl;
  const hasLegacyInitialsAlias =
    left.nickname === right.initials || right.nickname === left.initials;

  return hasSameAvatar || hasLegacyInitialsAlias;
};

export const filterVisibleUsers = (userList: IUser[]): IUser[] => {
  const deduplicatedUsers: IUser[] = [];

  userList
    .filter(user => !isDeletedBotUser(user))
    .map(normalizeUserDisplayName)
    .forEach(user => {
      const duplicateIndex = deduplicatedUsers.findIndex(existingUser =>
        areLikelyDuplicateUsers(existingUser, user)
      );

      if (duplicateIndex === -1) {
        deduplicatedUsers.push(user);
        return;
      }

      if (
        getCanonicalUserScore(user) >
        getCanonicalUserScore(deduplicatedUsers[duplicateIndex])
      ) {
        deduplicatedUsers[duplicateIndex] = user;
      }
    });

  return deduplicatedUsers;
};
