import { Reqi } from '@pksep/reqi';
import { getAuthToken } from '../composables/useLogin';
import { getConfig } from './useConfig';

let apiInstance: Reqi | null = null;

export const useChatApi = (): Reqi => {
  if (!apiInstance) {
    const config = getConfig();
    apiInstance = new Reqi(config.CHAT_API_DOMAIN);

    apiInstance.request.use(async (request: Request): Promise<Request> => {
      try {
        const token = getAuthToken();
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`);
        }
        return request;
      } catch (error) {
        console.error('Failed to fetch token:', error);
        throw new Error('Chat token is not defined in environment variables');
      }
    });
  }
  return apiInstance;
};
