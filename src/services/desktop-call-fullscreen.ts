import type { Window } from '@tauri-apps/api/window';

export async function waitForDesktopCallFullscreen(
  window: Pick<Window, 'isFullscreen'>,
  enabled: boolean,
  current: () => boolean
): Promise<void> {
  const deadline = performance.now() + 8000;
  // ACK приходит раньше WM; macOS также завершает анимацию смены Space.
  while (current()) {
    if ((await window.isFullscreen()) === enabled) return;
    if (performance.now() >= deadline)
      throw new Error('Оконная система не завершила полноэкранный переход');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}
