import { getAndroidKeyboardInset } from './android-keyboard-viewport';

export function getVisibleViewport() {
  const viewport = window.visualViewport;
  const left = Math.max(0, viewport?.offsetLeft || 0);
  const top = Math.max(0, viewport?.offsetTop || 0);
  const right = Math.min(innerWidth, left + (viewport?.width || innerWidth));
  // В Android APK WebView сохраняет полную высоту при открытой клавиатуре.
  const keyboard = document.documentElement.classList.contains(
    'chat-android-ime'
  )
    ? getAndroidKeyboardInset()
    : 0;
  const bottom = Math.max(
    top,
    Math.min(innerHeight - keyboard, top + (viewport?.height || innerHeight))
  );
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  };
}
