export type DesktopBrowserPlatform =
  | 'windows'
  | 'macos'
  | 'linux'
  | 'unknown'
  | 'mobile';

export const DESKTOP_APP_OPEN_URL = 'sepchat://open';
export const DESKTOP_APP_DOWNLOAD_PAGE_URL = 'https://pksep.ru/chat/#contacts';

export const desktopBrowserPlatform = (
  device: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>
): DesktopBrowserPlatform => {
  const { userAgent, platform, maxTouchPoints } = device;
  if (
    /Android|iPhone|iPad|iPod/i.test(userAgent) ||
    (platform === 'MacIntel' && maxTouchPoints > 1)
  )
    return 'mobile';
  if (/Win/i.test(platform || userAgent)) return 'windows';
  if (/Mac/i.test(platform || userAgent)) return 'macos';
  if (/Linux/i.test(platform || userAgent) && !/CrOS/i.test(userAgent))
    return 'linux';
  return 'unknown';
};
