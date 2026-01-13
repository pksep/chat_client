import type { User } from '../services/useChatSDK/types';
import { ref, Ref } from 'vue';
import { setAuthToken } from './useLogin';
import { getConfig } from '../services/useConfig';

export const authedUser: Ref<User | null> = ref(null);

interface AuthResponse {
  token: string;
  userId?: string;
  user?: User;
  expireTimeSeconds?: number;
}

export const useAuth = async (erpToken: string): Promise<AuthResponse> => {
  const config = getConfig();
  const response = await fetch(`${config.CHAT_AUTH_API}/chat/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ erpToken })
  });
  const data = await response.json();

  const token = data.token || data.accessToken;
  const user = data.user || data.userInfo;
  const userId = data.userId || data.UserID || user?.id;

  if (token) {
    setAuthToken(token, data.expireTimeSeconds || 0);
  }

  return {
    token,
    userId,
    user,
    expireTimeSeconds: data.expireTimeSeconds
  };
};

export const fetchAuthUser = async (): Promise<User | null> => {
  return authedUser.value;
};

export const setAuthUser = (user: User | null) => {
  authedUser.value = user;
};

export const getAuthUser = () => authedUser.value;
