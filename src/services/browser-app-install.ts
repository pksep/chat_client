import { isIosWeb } from '../utils/ios-pwa-viewport';
import { clearAppShellCache } from './daily-web-update';

// Manifest подключается только в Safari/iOS-браузере. Desktop и Android
// используют обычный веб-клиент и установщики нативного приложения.
export const configureBrowserAppInstall = (): (() => void) => {
  const ios = isIosWeb();
  const manifests = document.querySelectorAll<HTMLLinkElement>(
    'link[rel="manifest"]'
  );
  if (ios) {
    if (!manifests.length) {
      const manifest = document.createElement('link');
      manifest.rel = 'manifest';
      manifest.href = '/manifest.webmanifest';
      document.head.append(manifest);
    }
  } else {
    manifests.forEach(manifest => manifest.remove());
    // Убираем старую PWA-оболочку, сохраняя push/upload workers и данные чата.
    void clearAppShellCache().catch(() => undefined);
  }

  const preventInstall = (event: Event) => event.preventDefault();
  if (!ios) window.addEventListener('beforeinstallprompt', preventInstall);
  return () =>
    window.removeEventListener('beforeinstallprompt', preventInstall);
};
