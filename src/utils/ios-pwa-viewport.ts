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
    const visualHeight = viewport?.height || window.innerHeight;
    const keyboardOpen = window.innerHeight - visualHeight > 100;
    // Без клавиатуры visualViewport в standalone WebKit может исключать
    // системную область снизу. Она уже учитывается отступами компонентов.
    const height = keyboardOpen ? visualHeight : window.innerHeight;
    // После клавиатуры/возврата в PWA iOS может сохранить прокрутку документа.
    // Скроллится только история внутри приложения, а не корневой viewport.
    if (!keyboardOpen && (window.scrollX || window.scrollY)) {
      window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
    }
    root.style.setProperty('--ios-viewport-height', `${height}px`);
    root.style.setProperty(
      '--ios-viewport-top',
      `${keyboardOpen ? window.scrollY + Math.max(0, viewport?.offsetTop || 0) : 0}px`
    );
    root.classList.toggle('chat-ios-keyboard-open', keyboardOpen);
    const active = document.activeElement;
    if (keyboardOpen && active instanceof HTMLElement) {
      const form = active.closest<HTMLElement>('.authorization-screen');
      if (form) {
        const fieldRect = active.getBoundingClientRect();
        const formRect = form.getBoundingClientRect();
        const top = Math.max(formRect.top, viewport?.offsetTop || 0) + 20;
        const bottom =
          Math.min(formRect.bottom, (viewport?.offsetTop || 0) + height) - 20;
        if (fieldRect.bottom > bottom)
          form.scrollTop += fieldRect.bottom - bottom;
        else if (fieldRect.top < top) form.scrollTop -= top - fieldRect.top;
      }
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  root.classList.add('chat-ios-pwa');
  update();
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('pageshow', schedule);
  document.addEventListener('visibilitychange', schedule);
  document.addEventListener('focusout', schedule);
  document.addEventListener('focusin', schedule);
  return () => {
    cancelAnimationFrame(frame);
    viewport?.removeEventListener('resize', schedule);
    viewport?.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('pageshow', schedule);
    document.removeEventListener('visibilitychange', schedule);
    document.removeEventListener('focusout', schedule);
    document.removeEventListener('focusin', schedule);
    root.classList.remove(
      'chat-ios-web',
      'chat-ios-pwa',
      'chat-ios-keyboard-open'
    );
    root.style.removeProperty('--ios-viewport-height');
    root.style.removeProperty('--ios-viewport-top');
  };
}
