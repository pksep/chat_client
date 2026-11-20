export type DesktopBrowserPlatform =
  | 'windows'
  | 'macos'
  | 'linux'
  | 'unknown'
  | 'mobile';

export const DESKTOP_APP_OPEN_URL = 'sepchat://open';
export const DESKTOP_APP_DOWNLOADS = [
  {
    platform: 'windows',
    label: 'Windows',
    url: 'https://chat-server-prod.pksep.ru/api/downloads/desktop/windows-x64'
  },
  {
    platform: 'macos',
    label: 'Mac Apple Silicon',
    url: 'https://chat-server-prod.pksep.ru/api/downloads/desktop/macos-arm64'
  },
  {
    platform: 'macos',
    label: 'Mac Intel',
    url: 'https://chat-server-prod.pksep.ru/api/downloads/desktop/macos-x64'
  },
  {
    platform: 'linux',
    label: 'Linux',
    url: 'https://chat-server-prod.pksep.ru/api/downloads/desktop/linux-x64'
  }
] as const;

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

export const desktopAppDownloadsFor = (platform: DesktopBrowserPlatform) => [
  ...DESKTOP_APP_DOWNLOADS.filter(item => item.platform === platform),
  ...DESKTOP_APP_DOWNLOADS.filter(item => item.platform !== platform)
];
