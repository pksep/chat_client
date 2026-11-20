import { isTauri } from '@tauri-apps/api/core';

export const suppressDefaultDesktopContextMenu = (): (() => void) => {
  if (!isTauri()) return () => {};
  const preventDefaultMenu = (event: MouseEvent): void =>
    event.preventDefault();
  // Не останавливаем событие: меню сообщений и файлов продолжат его получать.
  document.addEventListener('contextmenu', preventDefaultMenu, true);
  return () =>
    document.removeEventListener('contextmenu', preventDefaultMenu, true);
};
