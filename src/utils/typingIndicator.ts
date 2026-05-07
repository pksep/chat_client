import type { ITopic, IUser } from '../components/interfaces/interfaces';
import { TopicType } from '../services/useChatSDK/types';

const getUserDisplayName = (user: IUser): string =>
  user.initials || user.nickname || 'Пользователь';

const getUsersCountLabel = (count: number): string => {
  const absCount = Math.abs(count);
  const lastTwoDigits = absCount % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return 'пользователей';
  }

  const lastDigit = absCount % 10;

  if (lastDigit === 1) {
    return 'пользователь';
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'пользователя';
  }

  return 'пользователей';
};

export const getTypingIndicatorLabel = (
  topicType: ITopic['type'] | undefined,
  typingUsers: IUser[]
): string => {
  if (!typingUsers.length) {
    return '';
  }

  if (topicType !== TopicType.Group) {
    return 'Печатает';
  }

  if (typingUsers.length === 1) {
    return `${getUserDisplayName(typingUsers[0])} печатает`;
  }

  return `${typingUsers.length} ${getUsersCountLabel(typingUsers.length)} печатают`;
};
