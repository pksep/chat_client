export const RUSTORE_APP_URL =
  'https://www.rustore.ru/catalog/app/sep.pksep.app';

export const ANDROID_APP_OPEN_URL =
  'intent://chat.pksep.ru/#Intent;scheme=https;package=sep.pksep.app;' +
  `S.browser_fallback_url=${encodeURIComponent(RUSTORE_APP_URL)};end`;

export const openAndroidApp = () => {
  const link = document.createElement('a');
  link.href = ANDROID_APP_OPEN_URL;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
};
