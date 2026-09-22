import type { TopicSetting } from '@pksep/zod-shared-chat';
import type { ITopic, ITopicInfo } from '../components/interfaces/interfaces';

type TopicPinSetting = Partial<TopicSetting> &
  Pick<TopicSetting, 'isPin'> & {
    pinnedAt?: string | Date | null;
  };

const toTimestamp = (value?: string | Date | null): number => {
  if (!value) return 0;

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const applyTopicPinSetting = (
  currentInfo: ITopicInfo | undefined,
  setting: TopicPinSetting,
  fallbackPinnedAt: string | Date = new Date()
): ITopicInfo => {
  const info: ITopicInfo = {
    ...currentInfo,
    ...setting
  };

  if (setting.isPin) {
    info.pinnedAt = setting.pinnedAt || setting.updatedAt || fallbackPinnedAt;
  } else {
    delete info.pinnedAt;
  }

  return info;
};

export const sortTopicsByPinOrder = (topics: ITopic[]): ITopic[] =>
  [...topics].sort((a, b) => {
    const aPinned = Boolean(a.info?.isPin);
    const bPinned = Boolean(b.info?.isPin);

    if (aPinned !== bPinned) {
      return aPinned ? -1 : 1;
    }

    const aTime = aPinned
      ? toTimestamp(
          a.info?.pinnedAt || a.info?.updatedAt || a.updatedAt || a.createdAt
        )
      : toTimestamp(a.lastMessage?.createdAt || a.createdAt);
    const bTime = bPinned
      ? toTimestamp(
          b.info?.pinnedAt || b.info?.updatedAt || b.updatedAt || b.createdAt
        )
      : toTimestamp(b.lastMessage?.createdAt || b.createdAt);

    return bTime - aTime;
  });
