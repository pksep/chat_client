import { Capacitor, CapacitorHttp } from '@capacitor/core';
import {
  CHAT_CONTENT_REQUEST_TIMEOUT_MS,
  withNetworkTimeout
} from './network-timeout';

export const fetchAuthWithCookies = async (
  url: string,
  method: 'GET' | 'POST',
  data?: Record<string, unknown>
): Promise<Response> => {
  const headers = {
    Accept: 'application/json',
    ...(data ? { 'Content-Type': 'application/json' } : {})
  };

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
      response.status === 204 || response.status === 205 || response.status === 304
        ? null
        : typeof response.data === 'string'
          ? response.data
          : JSON.stringify(response.data ?? null);

    return new Response(body, { status: response.status });
  }

  return withNetworkTimeout(signal =>
    fetch(url, {
      method,
      headers,
      credentials: 'include',
      cache: 'no-store',
      signal,
      ...(data ? { body: JSON.stringify(data) } : {})
    })
  );
};
