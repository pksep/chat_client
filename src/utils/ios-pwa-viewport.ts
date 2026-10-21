import { Capacitor } from '@capacitor/core';

export const isIosStandalonePwa = (): boolean => {
  const isIos =
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return (
    isIos &&
    !Capacitor.isNativePlatform() &&
    ((navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches)
  );
};

export function initIosPwaViewport(): () => void {
  if (!isIosStandalonePwa()) return () => {};
  const root = document.documentElement;
  const viewport = window.visualViewport;
  let frame = 0;
  const update = () => {
    frame = 0;
    // При увеличении страницы сохраняем масштабирование и панорамирование iOS.
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
    const height = viewport?.height || window.innerHeight;
    root.style.setProperty('--ios-viewport-height', `${height}px`);
    root.style.setProperty(
      '--ios-viewport-top',
      `${viewport?.offsetTop || 0}px`
    );
    root.classList.toggle(
      'chat-ios-keyboard-open',
      window.innerHeight - height > 100
    );
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
    root.classList.remove('chat-ios-pwa', 'chat-ios-keyboard-open');
    root.style.removeProperty('--ios-viewport-height');
    root.style.removeProperty('--ios-viewport-top');
  };
}
