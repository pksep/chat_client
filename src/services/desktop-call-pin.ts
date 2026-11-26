import type { Window } from '@tauri-apps/api/window';

export async function setDesktopCallPinned(
  window: Pick<Window, 'setAlwaysOnTop' | 'isAlwaysOnTop'>,
  enabled: boolean
): Promise<void> {
  await window.setAlwaysOnTop(enabled);
  const deadline = performance.now() + 1000;
  // X11 подтверждает состояние отдельным событием оконного менеджера.
  while ((await window.isAlwaysOnTop()) !== enabled) {
    if (performance.now() >= deadline)
      throw new Error('Оконная система не применила закрепление');
    await new Promise(resolve => setTimeout(resolve, 30));
  }
}
