import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  CHAT_CONTENT_REQUEST_TIMEOUT_MS,
  withNetworkTimeout
} from './network-timeout';

export const fetchAuthWithCookies = async (
  url: string,
  method: 'GET' | 'POST',
  data?: Record<string, unknown>,
  requestHeaders?: Record<string, string>
): Promise<Response> => {
  const headers = {
    Accept: 'application/json',
    ...(data ? { 'Content-Type': 'application/json' } : {}),
    ...requestHeaders
  };

  return withNetworkTimeout(async signal => {
    if (isTauri()) {
      // WebView2 хранит HttpOnly-cookie; нативный HTTP не теряет их из-за
      // SameSite=Lax между локальным адресом Tauri и сервером организации.
      const response = await invoke<{ status: number; body: string }>(
        'desktop_auth_request',
        { options: { url, method, headers, data } }
      );
      return new Response(
        [204, 205, 304].includes(response.status) ? null : response.body,
        { status: response.status }
      );
    }

    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      // Нативный HTTP хранит HttpOnly-cookie в CookieManager и отправляет их
      // независимо от SameSite-ограничений локального WebView.
      const response = await CapacitorHttp.request({
        url,
        method,
        headers: { ...headers, 'Cache-Control': 'no-store' },
        data,
        responseType: 'json',
        connectTimeout: CHAT_CONTENT_REQUEST_TIMEOUT_MS,
        readTimeout: CHAT_CONTENT_REQUEST_TIMEOUT_MS,
        disableRedirects: true
      });
      const body =
        response.status === 204 ||
        response.status === 205 ||
        response.status === 304
          ? null
          : typeof response.data === 'string'
            ? response.data
            : JSON.stringify(response.data ?? null);

      return new Response(body, { status: response.status });
    }

    const response = await fetch(url, {
      method,
      headers,
      credentials: 'include',
      cache: 'no-store',
      signal,
      ...(data ? { body: JSON.stringify(data) } : {})
    });
    // Полученные заголовки ещё не означают, что тело ответа удалось прочитать.
    // Копия сохраняет метаданные и непрочитанное тело для вызывающего кода.
    await response.clone().arrayBuffer();
    return response;
  });
};
