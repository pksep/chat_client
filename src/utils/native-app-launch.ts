/** Браузер не сообщает, установлен ли обработчик протокола. Ждём ухода в приложение или возврата фокуса после системного диалога. */
export const launchNativeApp = (
  url: string,
  options: {
    navigate?: boolean;
    onFallback?: () => void;
    onOpened?: () => void;
    onBlur?: () => void;
  } = {}
): (() => void) => {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const dispose = (): void => {
    active = false;
    clearTimeout(timer);
    window.removeEventListener('focus', handleFocus);
    window.removeEventListener('blur', handleBlur);
    window.removeEventListener('pagehide', handleOpened);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
  const finish = (): void => {
    timer = undefined;
    if (!active) return;
    if (document.visibilityState !== 'visible') {
      handleOpened();
      return;
    }
    // Открытый системный запрос забирает фокус. Не считаем его отказом.
    if (!document.hasFocus()) return;
    dispose();
    options.onFallback?.();
  };
  const handleFocus = (): void => {
    if (active && timer === undefined) timer = setTimeout(finish, 300);
  };
  const handleBlur = (): void => options.onBlur?.();
  const handleOpened = (): void => {
    if (!active) return;
    dispose();
    options.onOpened?.();
  };
  const handleVisibility = (): void => {
    if (document.visibilityState === 'hidden') handleOpened();
  };

  window.addEventListener('focus', handleFocus);
  window.addEventListener('blur', handleBlur);
  window.addEventListener('pagehide', handleOpened);
  document.addEventListener('visibilitychange', handleVisibility);
  timer = setTimeout(finish, 2000);

  if (options.navigate !== false) {
    const link = document.createElement('a');
    link.href = url;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
  }
  return dispose;
};
