export const ANDROID_DOWNLOAD_CONFIG_URL =
  'https://pksep.github.io/sep-chat-ui/android-download.json';

export type AndroidDownload = {
  apkUrl: string;
  qrImageUrl: string;
};

const publicHttpsUrl = (value: unknown): string => {
  if (typeof value !== 'string' || value.length > 2048) throw new Error();
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    throw new Error();
  return url.href;
};

export const loadAndroidDownload = async (
  signal: AbortSignal
): Promise<AndroidDownload> => {
  const response = await fetch(ANDROID_DOWNLOAD_CONFIG_URL, {
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    signal
  });
  if (!response.ok || Number(response.headers.get('content-length')) > 4096)
    throw new Error();
  const text = await response.text();
  if (text.length > 4096) throw new Error();
  const value = JSON.parse(text);
  if (value.schemaVersion !== 1 || value.enabled !== true) throw new Error();
  return {
    apkUrl: publicHttpsUrl(value.apkUrl),
    qrImageUrl: publicHttpsUrl(value.qrImageUrl)
  };
};
