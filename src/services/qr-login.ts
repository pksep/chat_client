import { Capacitor } from '@capacitor/core';
import { isTauri } from '@tauri-apps/api/core';
import {
  getStoredChatAccessToken,
  isChatAccessTokenExpired,
  tryRefreshErpSession
} from '../composables/useAuth';
import { getAuthToken } from '../composables/useLogin';
import { fetchAuthWithCookies } from '../utils/auth-http';
import { getConfig } from './useConfig';
import { SHORT_QR_LOGIN_ENABLED } from './qr-login-settings';

export const QR_LOGIN_REFRESH_LEAD_MS = 10_000;
const QR_LOGIN_MIN_TOKEN_VALIDITY_MS = 100_000;

const currentToken = () => getAuthToken() || getStoredChatAccessToken();

export const createQrLogin = async (): Promise<{
  url: string;
  expiresAt: number;
}> => {
  const apiUrl = getConfig().CHAT_API_DOMAIN?.replace(/\/+$/, '');
  if (!apiUrl) throw new Error('Не настроен адрес организации');

  let token = currentToken();
  let refreshed = false;
  const refreshToken = async () => {
    refreshed = true;
    const result = await tryRefreshErpSession();
    token = currentToken();
    return !!result?.token;
  };

  // После долгого простоя JWT должен пережить весь срок одноразового QR (90 с).
  if (token && isChatAccessTokenExpired(token, QR_LOGIN_MIN_TOKEN_VALIDITY_MS))
    await refreshToken();
  if (!token || isChatAccessTokenExpired(token, QR_LOGIN_MIN_TOKEN_VALIDITY_MS))
    throw new Error('Сессия истекла. Войдите в чат заново.');

  if (!SHORT_QR_LOGIN_ENABLED) {
    const currentUrl = new URL(window.location.href);
    const organization =
      localStorage.getItem('chat_runtime_last_organization') ||
      currentUrl.searchParams.get('organization') ||
      apiUrl.replace(/\/api$/, '');
    const url = new URL(
      '/',
      Capacitor.isNativePlatform() || isTauri()
        ? 'https://chat.pksep.ru/'
        : currentUrl.origin
    );
    url.searchParams.set('token', token);
    url.searchParams.set('organization', organization);
    // Периодически пересобираем открытую ссылку с актуальным токеном.
    return { url: url.toString(), expiresAt: Date.now() + 90_000 };
  }

  const request = () =>
    fetchAuthWithCookies(`${apiUrl}/v2/auth/qr`, 'POST', undefined, {
      Authorization: `Bearer ${token}`
    });
  let response = await request();
  // Обновляем только при необходимости и через штатный источник сессии (ERP/чат).
  if (response.status === 401 && !refreshed) {
    const recovered = await refreshToken();
    if (
      recovered &&
      token &&
      !isChatAccessTokenExpired(token, QR_LOGIN_MIN_TOKEN_VALIDITY_MS)
    )
      response = await request();
  }
  if (!response.ok) throw new Error('Не удалось создать QR-код');

  const data: unknown = await response.json();
  if (
    !data ||
    typeof data !== 'object' ||
    !('code' in data) ||
    typeof data.code !== 'string' ||
    !/^[A-Za-z0-9_-]{22}$/.test(data.code) ||
    !('expires_at' in data) ||
    typeof data.expires_at !== 'string'
  ) {
    throw new Error('Не удалось прочитать QR-код входа');
  }

  const expiresAt = Date.parse(data.expires_at);
  if (
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now() + QR_LOGIN_REFRESH_LEAD_MS
  )
    throw new Error('QR-код истёк. Попробуйте ещё раз.');

  const url = new URL(`${apiUrl}/v2/q`);
  url.hash = `qr=${data.code}`;
  return { url: url.toString(), expiresAt };
};
