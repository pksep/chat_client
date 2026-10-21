import { Capacitor } from '@capacitor/core';

export const isIosWeb = (): boolean => {
  const isIos =
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return isIos && !Capacitor.isNativePlatform();
};

export const isIosStandalonePwa = (): boolean => {
  return (
    isIosWeb() &&
    ((navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches)
  );
};

export function initIosPwaViewport(): () => void {
  if (!isIosWeb()) return () => {};
  const root = document.documentElement;
  root.classList.add('chat-ios-web');
  if (!isIosStandalonePwa()) return () => root.classList.remove('chat-ios-web');
  const viewport = window.visualViewport;
  let frame = 0;
  const update = () => {
    frame = 0;
    // При увеличении страницы сохраняем масштабирование и панорамирование iOS.
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
    const height = viewport?.height || window.innerHeight;
    const keyboardOpen = window.innerHeight - height > 100;
    root.style.setProperty('--ios-viewport-height', `${height}px`);
    root.style.setProperty(
      '--ios-viewport-top',
      `${keyboardOpen ? Math.max(0, viewport?.offsetTop || 0) : 0}px`
    );
    root.classList.toggle('chat-ios-keyboard-open', keyboardOpen);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  root.classList.add('chat-ios-pwa');
  update();
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('pageshow', schedule);
  document.addEventListener('visibilitychange', schedule);
  return () => {
    cancelAnimationFrame(frame);
    viewport?.removeEventListener('resize', schedule);
    viewport?.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('pageshow', schedule);
    document.removeEventListener('visibilitychange', schedule);
    root.classList.remove(
      'chat-ios-web',
      'chat-ios-pwa',
      'chat-ios-keyboard-open'
    );
    root.style.removeProperty('--ios-viewport-height');
    root.style.removeProperty('--ios-viewport-top');
  };
}
