import { useChatApi } from '../services/useApi';

export type RegisterUser = {
  userID: string;
  nickname: string;
  ex?: string;
};

interface RegisterParams {
  users: RegisterUser[];
}

type AuthTokenListener = (token: string | null) => void;

const authTokenListeners = new Set<AuthTokenListener>();

const notifyAuthTokenChanged = (token: string | null): void => {
  authTokenListeners.forEach(listener => listener(token));
};

const setCookie = (name: string, value: string, expiresIn: number): void => {
  const date = new Date();
  date.setTime(date.getTime() + expiresIn * 1000);
  const expires = `expires=${date.toUTCString()}`;
  document.cookie = `${name}=${value};${expires};path=/;SameSite=Strict`;
};

const getCookie = (name: string): string | null => {
  const nameEQ = `${name}=`;
  const cookies = document.cookie.split(';');
  for (let cookie of cookies) {
    cookie = cookie.trim();
    if (cookie.startsWith(nameEQ)) {
      return cookie.substring(nameEQ.length);
    }
  }
  return null;
};

const removeCookie = (name: string): void => {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`;
};

export const useRegister = async (
  params: RegisterParams
): Promise<{ errCode: number; errDlt: string; errMsg: string }> => {
  const api = useChatApi();
  const response = await api.post('/user/user_register', params);

  const data = await response.json();

  return data;
};

export const useLogout = (): void => {
  removeCookie('authToken');
  notifyAuthTokenChanged(null);

  sessionStorage.removeItem('chat_user');
};

export const setAuthToken = (
  token: string,
  expireTimeSeconds?: number
): void => {
  if (!expireTimeSeconds) {
    document.cookie = `authToken=${token};path=/;SameSite=Strict`;
    notifyAuthTokenChanged(token);
    return;
  }
  setCookie('authToken', token, expireTimeSeconds);
  notifyAuthTokenChanged(token);
};

export const subscribeAuthToken = (
  listener: AuthTokenListener
): (() => void) => {
  authTokenListeners.add(listener);
  return () => authTokenListeners.delete(listener);
};

export const getAuthToken = (): string | null => {
  return getCookie('authToken');
};
