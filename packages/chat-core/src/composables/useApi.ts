import { Reqi } from '@pksep/reqi';
import { getOrGeneratePlatformId } from '../services/useOpenIM';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const createOpenIMRestApi = (): Reqi => {
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
let tokenPromise: Promise<string> | null = null;

/**
 * Fetches admin token from OpenIM API using credentials from environment variables
 * @returns Promise resolving to the authentication token
 */
const getAdminToken = async (): Promise<string> => {
  const adminApi = createOpenIMRestApi();
  const response = await adminApi.post('/auth/admin_login', {
    secret: import.meta.env.VITE_OPENIM_SECRET || 'openIM123',
    userID: import.meta.env.VITE_OPENIM_ADMIN_USER || 'imAdmin'
  });

  const { token } = await response.json();
  return token;
};

/**
 * Gets authentication token either from environment variables or by fetching a new one
 * @returns Promise resolving to the authentication token
 */
const getTokenFromEnv = async (): Promise<string> => {
  if (!import.meta.env.VITE_OPENIM_TOKEN) {
    if (!tokenPromise) {
      tokenPromise = getAdminToken();
      saveTokenToEnv(await tokenPromise);
    }
    return tokenPromise;
  }
  return import.meta.env.VITE_OPENIM_TOKEN;
};

export const saveTokenToEnv = (
  token: string,
  rootDir: string = process.cwd()
): void => {
  const envFilePath = resolve(rootDir, '.env');

  let envContent = '';
  if (existsSync(envFilePath)) {
    envContent = readFileSync(envFilePath, 'utf8');
  }

  const tokenRegex = /^OPENIM_GEN_TOKEN=.*$/m;
  if (tokenRegex.test(envContent)) {
    envContent = envContent.replace(tokenRegex, `OPENIM_GEN_TOKEN=${token}`);
  } else {
    if (envContent && !envContent.endsWith('\n')) {
      envContent += '\n';
    }
    envContent += `OPENIM_GEN_TOKEN=${token}\n`;
  }

  writeFileSync(envFilePath, envContent);
};

export const useOpenIMRestApi = (): Reqi => {
  if (!apiInstance) {
    apiInstance = createOpenIMRestApi();

    apiInstance.request.use(async (request: Request): Promise<Request> => {
      try {
        const token = await getTokenFromEnv();
        request.headers.set('token', token);
        return request;
      } catch (error) {
        console.error('Failed to fetch token:', error);
        throw new Error('OpenIM token is not defined in environment variables');
      }
    });
  }
  return apiInstance;
};
