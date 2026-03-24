import type { User } from '@pksep/zod-shared-chat';
import { ref, Ref } from 'vue';
import { setAuthToken } from './useLogin';
import { getConfig } from '../services/useConfig';

export const authedUser: Ref<User | null> = ref(null);
export const CHAT_AUTH_SESSION_KEY = 'chat_auth_session';

interface AuthResponse {
  token: string;
  user?: User;
  erpToken?: string;
}

interface DirectAuthCredentials {
  identifier: string;
  password: string;
}

interface StoredChatAuthSession {
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

export const loginWithCredentials = async (
  credentials: DirectAuthCredentials
): Promise<AuthResponse> => {
  const config = getConfig();
  const response = await fetch(
    `${config.CHAT_AUTH_API}/chat/credentials-login`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(credentials)
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || 'Credentials login failed');
  }

  if (data.token) {
    setAuthToken(data.token);
  }

  return {
    token: data.token,
    user: data.user,
    erpToken: data.erpToken
  };
};

export const saveChatAuthSession = (
  session: StoredChatAuthSession,
  persist = true
): void => {
  const storage = persist ? localStorage : sessionStorage;
  const secondaryStorage = persist ? sessionStorage : localStorage;

  secondaryStorage.removeItem(CHAT_AUTH_SESSION_KEY);
  storage.setItem(CHAT_AUTH_SESSION_KEY, JSON.stringify(session));
};

export const getChatAuthSession = (): StoredChatAuthSession | null => {
  const raw =
    localStorage.getItem(CHAT_AUTH_SESSION_KEY) ||
    sessionStorage.getItem(CHAT_AUTH_SESSION_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredChatAuthSession;
  } catch (error) {
    console.error('Failed to parse chat auth session', error);
    return null;
  }
};

export const clearChatAuthSession = (): void => {
  localStorage.removeItem(CHAT_AUTH_SESSION_KEY);
  sessionStorage.removeItem(CHAT_AUTH_SESSION_KEY);
};

export const fetchAuthUser = async (): Promise<User | null> => {
  return authedUser.value;
};

export const setAuthUser = (user: User | null) => {
  authedUser.value = user;
};

export const getAuthUser = () => authedUser.value;
