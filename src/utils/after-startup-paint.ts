import { NATIVE_STARTUP_READY_EVENT } from './nativeStartup';

let startupPaint: Promise<void> | undefined;

// Фоновые запросы не должны конкурировать с первым свежим экраном чата.
export const afterStartupPaint = (): Promise<void> =>
  (startupPaint ??= new Promise<void>(resolve => {
    const afterShell = () => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    };
    if (document.getElementById('startup-shell')) {
      window.addEventListener(NATIVE_STARTUP_READY_EVENT, afterShell, {
        once: true
      });
    } else {
      afterShell();
    }
  }));
