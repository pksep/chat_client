import { Capacitor, registerPlugin } from '@capacitor/core';
import { getAuthUser } from '../composables/useAuth';
import { getConfig } from './useConfig';
import { matchesPreparedStartupHistory } from '../utils/startup-history';

const nativeHistory = registerPlugin<{
  takeStartupHistory(options: {
    userId: string;
    apiUrl: string;
    topicId: string;
  }): Promise<{ available?: boolean; data?: unknown }>;
}>('ChatBackgroundSync');

export const takeNativeStartupHistory = async <T extends unknown[]>(
  topicId = ''
): Promise<T | null> => {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android')
    return null;
  const userId = getAuthUser()?.id;
  const apiUrl = getConfig().CHAT_API_DOMAIN;
  if (!userId || !apiUrl) return null;
  try {
    performance.mark('chat-startup:native-history-requested');
    const prepared = window.__chatNativePreparedHistory;
    window.__chatNativePreparedHistory = undefined;
    const earlyResult = prepared ? await prepared : null;
    const result = matchesPreparedStartupHistory(
      earlyResult,
      userId,
      apiUrl,
      topicId
    )
      ? earlyResult!
      : await nativeHistory.takeStartupHistory({
          userId,
          apiUrl,
          topicId
        });
    if (getAuthUser()?.id !== userId || getConfig().CHAT_API_DOMAIN !== apiUrl)
      return null;
    if (!result.available || !Array.isArray(result.data)) return null;
    performance.mark('chat-startup:native-history-applied', {
      detail: { topic: !!topicId }
    });
    return result.data as T;
  } catch {
    return null;
  }
};
