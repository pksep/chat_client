import type { IUser } from '../components/interfaces/interfaces';

export const CHAT_AUTH_SESSION_KEY = 'chat_auth_session';
export type ChatAuthSessionSource =
  | 'chat_credentials'
  | 'erp_bootstrap'
  | 'legacy'
  | 'unknown_shared';

export interface StoredChatAuthSession {
  token: string;
  user?: IUser;
  source?: ChatAuthSessionSource;
}

export const getChatAuthSession = (): StoredChatAuthSession | null => {
  const raw =
    localStorage.getItem(CHAT_AUTH_SESSION_KEY) ||
    sessionStorage.getItem(CHAT_AUTH_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredChatAuthSession;
  } catch (error) {
    console.error('Failed to parse chat auth session', error);
    return null;
  }
};
