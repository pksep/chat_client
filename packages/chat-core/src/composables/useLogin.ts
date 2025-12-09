import { useOpenIMRestApi } from '../services/useApi';

export type RegisterUser = {
  userID: string;
  nickname: string;
  faceURL?: string;
  ex?: string;
};

interface RegisterParams {
  users: RegisterUser[];
}

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
  const api = useOpenIMRestApi();
  const response = await api.post('/user/user_register', params);

  const data = await response.json();

  return data;
};

export const useLogout = (): void => {
  removeCookie('authToken');
};

export const setAuthToken = (
  token: string,
  expireTimeSeconds: number
): void => {
  setCookie('authToken', token, expireTimeSeconds);
};

export const getAuthToken = (): string | null => {
  return getCookie('authToken');
};
