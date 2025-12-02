import { Reqi } from '@pksep/reqi';
import { getAuthToken } from '../composables/useLogin';
import { getPlatformId } from '../composables/useAuth';

export const createOpenIMRestApi = (): Reqi => {
  const instance = new Reqi(
    import.meta.env.VITE_OPENIM_API_DOMAIN
      ? `https://${import.meta.env.VITE_OPENIM_API_DOMAIN}`
      : 'http://localhost:10002'
  );

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
