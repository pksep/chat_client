import { Reqi } from '@pksep/reqi';
import { getAuthToken } from '../composables/useLogin';
import { getConfig } from './useConfig';

let apiInstance: Reqi | null = null;

export const useOpenIMRestApi = (): Reqi => {
  if (!apiInstance) {
    const config = getConfig()
    apiInstance = new Reqi(config.CHAT_API_DOMAIN);

    apiInstance.request.use(async (request: Request): Promise<Request> => {
      try {
        request.headers.set('token', getAuthToken());
        return request;
      } catch (error) {
        console.error('Failed to fetch token:', error);
        throw new Error('OpenIM token is not defined in environment variables');
      }
    });
  }
  return apiInstance;
};
