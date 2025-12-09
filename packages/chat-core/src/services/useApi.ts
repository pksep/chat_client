import { Reqi } from '@pksep/reqi';
import { getAuthToken } from '../composables/useLogin';
import { getPlatformId } from '../composables/useAuth';
import { getConfig } from './useConfig';

export const createOpenIMRestApi = (): Reqi => {
  const config = getConfig();

  const instance = new Reqi(config.VITE_OPENIM_API_DOMAIN);

  instance.request.use((request: Request): Request => {
    request.headers.set('operationID', `${getPlatformId()}_${Date.now()}`);
    return request;
  });

  return instance;
};

let apiInstance: Reqi | null = null;

export const useOpenIMRestApi = (): Reqi => {
  if (!apiInstance) {
    apiInstance = createOpenIMRestApi();

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
