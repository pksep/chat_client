import type { IUser } from '../components/interfaces/interfaces';
import { isDeletedBotUser } from './bot';
import { compactPersonName } from './personName';
import { parseUserEx } from './parseUserEx';

const canonicalScore = (user: IUser): number => {
  const ex = parseUserEx(user.ex) as { erpUserId?: string | number };
  return (
    (ex.erpUserId != null ? 4 : 0) + (/^\d+$/.test(user.nickname || '') ? 2 : 0)
  );
};

interface NameGroup {
  first: number;
  alias?: number;
  avatars: Map<string, Set<number>>;
}

export const filterVisibleUsers = (userList: IUser[]): IUser[] => {
  const result: IUser[] = [];
  const names = new Map<string, NameGroup>();
  for (const source of userList) {
    if (isDeletedBotUser(source)) continue;
    if (source.isBot) {
      result.push(source);
      continue;
    }
    const user = { ...source, initials: compactPersonName(source.initials) };
    let group = names.get(user.initials);
    if (!group) {
      group = { first: result.length, avatars: new Map() };
      names.set(user.initials, group);
    }
    let duplicate =
      user.nickname === user.initials && group.first < result.length
        ? group.first
        : group.alias;
    const avatarMatches = user.avatarUrl && group.avatars.get(user.avatarUrl);
    if (avatarMatches) {
      for (const index of avatarMatches) {
        duplicate = Math.min(duplicate ?? index, index);
      }
    }
    const index = duplicate ?? result.length;
    if (duplicate !== undefined) {
      const previous = result[index];
      if (canonicalScore(user) <= canonicalScore(previous)) continue;
      if (previous.avatarUrl) {
        const previousMatches = group.avatars.get(previous.avatarUrl)!;
        previousMatches.delete(index);
        if (previousMatches.size === 0)
          group.avatars.delete(previous.avatarUrl);
      }
      if (group.alias === index) group.alias = undefined;
    }
    result[index] = user;
    if (user.nickname === user.initials) group.alias = index;
    if (user.avatarUrl) {
      let matches = group.avatars.get(user.avatarUrl);
      if (!matches) group.avatars.set(user.avatarUrl, (matches = new Set()));
      matches.add(index);
    }
  }
  return result;
};
