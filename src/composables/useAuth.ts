import type { User } from '@pksep/zod-shared-chat';
import { ref, Ref } from 'vue';
import { setAuthToken } from './useLogin';
import { getConfig } from '../services/useConfig';

export const authedUser: Ref<User | null> = ref(null);

interface AuthResponse {
  token: string;
  user?: User;
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

  const token = data.token;
  const user = data.user;

  if (token) {
    setAuthToken(token, data.expireTimeSeconds || 0);
  }

  return {
    token,
    user
  };
};

export const fetchAuthUser = async (): Promise<User | null> => {
  return authedUser.value;
};

export const setAuthUser = (user: User | null) => {
  authedUser.value = user;
};

export const getAuthUser = () => authedUser.value;
