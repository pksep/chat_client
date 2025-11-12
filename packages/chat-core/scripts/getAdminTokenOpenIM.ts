import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { Reqi } from '@pksep/reqi';

export const saveTokenToEnv = (
  token: string,
  rootDir: string = process.cwd()
): void => {
  const envFilePath = resolve(rootDir, '.env');

  let envContent = '';
  if (existsSync(envFilePath)) {
    envContent = readFileSync(envFilePath, 'utf8');
  }

  const tokenRegex = /^VITE_OPENIM_TOKEN=.*$/m;
  if (tokenRegex.test(envContent)) {
    envContent = envContent.replace(tokenRegex, `VITE_OPENIM_TOKEN=${token}`);
  } else {
    if (envContent && !envContent.endsWith('\n')) {
      envContent += '\n';
    }
    envContent += `VITE_OPENIM_TOKEN=${token}\n`;
  }

  writeFileSync(envFilePath, envContent);
};

const getAdminToken = async (): Promise<string> => {
  const adminApi = new Reqi(
    process.env.VITE_OPENIM_API_DOMAIN
      ? `https://${process.env.VITE_OPENIM_API_DOMAIN}`
      : 'http://localhost:10002'
  );
  adminApi.request.use((request: Request): Request => {
    request.headers.set('operationID', `s0_${Date.now()}`);
    return request;
  });

  const response = await adminApi.post('/auth/get_admin_token', {
    secret: process.env.VITE_OPENIM_SECRET || 'openIM123',
    userID: process.env.VITE_OPENIM_ADMIN_USER || 'imAdmin'
  });

  const { data, errMsg } = await response.json();

  if (!data?.token) {
    throw new Error('Failed to get admin token', errMsg);
  }
  return data.token;
};

saveTokenToEnv(await getAdminToken());
