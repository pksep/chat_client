import {
  buildAndroidGroupCallInviteUrl,
  buildDesktopGroupCallInviteUrl
} from './groupCallInviteUrl';

export const APP_CLIENT_PARAM = 'appClient';
const PUBLIC_CHAT_ORIGIN = 'https://chat.pksep.ru';
const CHAT_PATH =
  /^\/(?:dialogs|group|call|favorites|assistant|ai)(?:\/[^/?#]+)?\/?$/;

const chatPath = (path: string): string =>
  path === '/' || CHAT_PATH.test(path) ? path : '/';

/** Передаём маршрут и организацию, но никогда не ERP-токен или QR из веб-адреса. */
export const buildChatAppUrl = (value: string, android = false): string => {
  const callUrl = android
    ? buildAndroidGroupCallInviteUrl(value)
    : buildDesktopGroupCallInviteUrl(value);
  if (callUrl) return callUrl;
  const source = new URL(value);
  const path = chatPath(source.pathname);
  const organization = source.searchParams.get('organization');

  if (android) {
    const publicUrl = new URL(path, PUBLIC_CHAT_ORIGIN);
    if (organization) publicUrl.searchParams.set('organization', organization);
    const fallback = new URL(publicUrl);
    fallback.searchParams.set(APP_CLIENT_PARAM, 'web');
    return (
      `intent://${publicUrl.host}${publicUrl.pathname}${publicUrl.search}` +
      '#Intent;scheme=https;package=sep.pksep.app;' +
      `S.browser_fallback_url=${encodeURIComponent(fallback.href)};end`
    );
  }

  const appUrl = new URL('sepchat://open');
  if (path !== '/') appUrl.searchParams.set('path', path);
  if (organization) appUrl.searchParams.set('organization', organization);
  return appUrl.href;
};

/** Нативный клиент принимает только маршруты чата, без произвольных редиректов. */
export const parseDesktopChatAppUrl = (value: string): URL | null => {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'sepchat:' ||
      url.hostname !== 'open' ||
      !['', '/'].includes(url.pathname) ||
      url.username ||
      url.password ||
      url.port ||
      url.searchParams.getAll('path').length > 1 ||
      url.searchParams.getAll('organization').length > 1
    )
      return null;
    const path = url.searchParams.get('path') || '/';
    if (path !== chatPath(path)) return null;
    const target = new URL(path, PUBLIC_CHAT_ORIGIN);
    const organization = url.searchParams.get('organization');
    if (organization) {
      const server = new URL(organization);
      if (
        !['https:', 'http:'].includes(server.protocol) ||
        server.username ||
        server.password
      )
        return null;
      target.searchParams.set('organization', organization);
    }
    return target;
  } catch {
    return null;
  }
};
