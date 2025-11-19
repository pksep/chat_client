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

interface LoginParams {
  platformID: number;
  userID: string;
}

interface LoginResponse {
  data: {
    token: string;
    expireTimeSeconds: number;
  };
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

export const useLogin = async (params: LoginParams): Promise<LoginResponse> => {
  const api = useOpenIMRestApi();
  const response = await api.post('/auth/get_user_token', params);

  const data: LoginResponse = await response.json();

  if (data?.data?.token) {
    setCookie('authToken', data.data.token, data.data.expireTimeSeconds);
    console.log('Token saved to cookie');
  }

  return data;
};

export const useLogout = (): void => {
  removeCookie('authToken');
  console.log('Token removed from cookie');
};

export const getAuthToken = (): string | null => {
  return getCookie('authToken');
};
