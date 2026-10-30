import type { IQrAuthResult, ParsedQrAuthPayload } from '../types/qr-auth';
import { fetchAuthWithCookies } from './auth-http';

/** Проверяет адрес организации до отправки одноразового кода. */
const qrOrganization = (raw: string): string | null => {
  try {
    const url = new URL(raw);

    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;

    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
};

/** Читает короткий QR и прежние QR с токеном, не выполняя сетевые запросы. */
export const parseQrAuthPayload = (raw: string): ParsedQrAuthPayload | null => {
  try {
    const url = new URL(raw);
    const fragment = new URLSearchParams(url.hash.slice(1));

    if (fragment.has('qr')) {
      const code = fragment.get('qr') || '';

      if (
        !/^[A-Za-z0-9_-]{22}$/.test(code) ||
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      )
        return null;

      // Сканер получает адрес API; обычная камера — перенаправленный URL веб-чата.
      const organization = url.pathname.endsWith('/api/v2/q')
        ? qrOrganization(
            `${url.origin}${url.pathname.slice(0, -'/api/v2/q'.length)}`
          )
        : qrOrganization(url.searchParams.get('organization') || '');

      return organization ? { code, organization } : null;
    }

    const token = url.searchParams.get('token')?.split('?token')[0] || '';

    return token
      ? { token, organization: url.searchParams.get('organization') || '' }
      : null;
  } catch {
    // Прежний сканер также принимал токен без URL.
    return raw ? { token: raw } : null;
  }
};

/** Раскрывает короткую ссылку и возвращает прежний контракт token QR. */
export const resolveQrAuthPayload = async (
  payload: ParsedQrAuthPayload
): Promise<IQrAuthResult> => {
  if (typeof payload.token === 'string')
    return { token: payload.token, organization: payload.organization };

  // Общий HTTP-транспорт работает и в браузере, и через Capacitor Android.
  const response = await fetchAuthWithCookies(
    `${payload.organization}/api/v2/auth/qr/exchange`,
    'POST',
    { code: payload.code }
  );

  if (!response.ok) throw new Error('QR-код истёк или уже использован');

  const data: unknown = await response.json();

  if (
    !data ||
    typeof data !== 'object' ||
    !('token' in data) ||
    typeof data.token !== 'string' ||
    !data.token
  ) {
    throw new Error('Не удалось прочитать QR-код входа');
  }

  // Организация остаётся адресом отсканированного сервера, а не произвольным redirect.
  return { token: data.token, organization: payload.organization };
};
