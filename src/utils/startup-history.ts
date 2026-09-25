export interface PreparedStartupHistory {
  available?: boolean;
  userId?: string;
  apiUrl?: string;
  topicId?: string;
  startedAt?: number;
  data?: unknown;
}

export const matchesPreparedStartupHistory = (
  result: PreparedStartupHistory | null,
  userId: string,
  apiUrl: string,
  topicId: string,
  now = Date.now()
): boolean => {
  const age = now - (result?.startedAt ?? 0);
  return !!(
    result?.available &&
    result.userId === userId &&
    userId &&
    result.apiUrl?.replace(/\/+$/, '') === apiUrl.replace(/\/+$/, '') &&
    result.topicId === topicId &&
    age >= 0 &&
    age < 10_000 &&
    Array.isArray(result.data)
  );
};
