import { Reqi } from '@pksep/reqi';
import { getAuthToken } from '../composables/useLogin';
import {
  getStoredChatAccessToken,
  withErpRefreshOnAuthError
} from '../composables/useAuth';
import { getConfig } from './useConfig';

let apiInstance: Reqi | null = null;

export const useChatApi = (): Reqi => {
  if (!apiInstance) {
    const config = getConfig();
    apiInstance = new Reqi(config.CHAT_API_DOMAIN);

    apiInstance.request.use(async (request: Request): Promise<Request> => {
      try {
        const token = getAuthToken() || getStoredChatAccessToken();
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`);
        }
        return request;
      } catch (error) {
        console.error('Failed to fetch token:', error);
        throw new Error('Chat token is not defined in environment variables');
      }
    });

    const methodNames = ['get', 'post', 'put', 'patch', 'delete'] as const;

    for (const methodName of methodNames) {
      const originalMethod = (apiInstance as any)[methodName];

      if (typeof originalMethod !== 'function') {
        continue;
      }

      (apiInstance as any)[methodName] = (...args: any[]) => {
        return withErpRefreshOnAuthError(() =>
          originalMethod.apply(apiInstance, args)
        );
      };
    }
  }
  return apiInstance;
};
