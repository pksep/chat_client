import type { ITopic } from '../components/interfaces/interfaces';

export interface TopicSyncState {
  version: number;
  pts: string;
  syncedAt: string;
}

export const topicSyncEndpoint = (state: TopicSyncState): string =>
  `/topics/sync?${new URLSearchParams({
    version: String(state.version),
    pts: state.pts,
    syncedAt: state.syncedAt
  })}`;

export type TopicSyncResponse =
  | { reset: true }
  | {
      reset: false;
      sync: TopicSyncState;
      topicIds: string[];
      data: ITopic[];
      unreadTopics: ITopic[];
      activeCalls: Array<
        NonNullable<ITopic['activeCall']> & { topicId?: string }
      >;
    };

export const isTopicSyncState = (value: unknown): value is TopicSyncState => {
  const state = value as TopicSyncState | null;
  return Boolean(
    state &&
      state.version === 1 &&
      typeof state.pts === 'string' &&
      /^\d{1,19}$/.test(state.pts) &&
      typeof state.syncedAt === 'string' &&
      Number.isFinite(Date.parse(state.syncedAt))
  );
};
