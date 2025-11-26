import { SelfUserInfo } from '@openim/wasm-client-sdk';
import { IMSDK } from '../services/useOpenIM';
import { ref, Ref } from 'vue';
import { setAuthToken } from './useLogin';

export const authedUser: Ref<any | null> = ref(null);

export const useAuth = async (
  erpToken: string
): Promise<{ UserID: string; PlatformID: number; token: string }> => {
  const response = await fetch(
    `${import.meta.env.VITE_CHAT_AUTH_API}/chat/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ erpToken })
    }
  );
  const data = await response.json();

  setAuthToken(data.token, data.expireTimeSeconds);

  return data;
};

export const fetchAuthUser = async (): Promise<any> => {
  try {
    const userInfo = await IMSDK.getSelfUserInfo();

    setAuthUser(userInfo.data);
    return userInfo.data;
  } catch (err: any) {
    console.error('Failed to fetch IMSDK user:', err);
    setAuthUser(null);
    throw err;
  }
};

export const setAuthUser = (user: SelfUserInfo) => {
  authedUser.value = user;
};

export const getAuthUser = () => authedUser.value;
