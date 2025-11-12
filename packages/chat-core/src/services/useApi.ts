import { Reqi } from '@pksep/reqi';
import { getOrGeneratePlatformId } from './useOpenIM';

export const createOpenIMRestApi = (): Reqi => {
  const instance = new Reqi(
    `https://${import.meta.env.VITE_OPENIM_API_DOMAIN}`
  );

  instance.request.use((request: Request): Request => {
    request.headers.set(
      'operationID',
      `${getOrGeneratePlatformId()}_${Date.now()}`
    );
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
        request.headers.set('token', import.meta.env.VITE_OPENIM_TOKEN);
        return request;
      } catch (error) {
        console.error('Failed to fetch token:', error);
        throw new Error('OpenIM token is not defined in environment variables');
      }
    });
  }
  return apiInstance;
};
