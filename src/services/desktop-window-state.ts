import { invoke } from '@tauri-apps/api/core';

export interface DesktopWindowState {
  label?: string;
  focused: boolean;
  minimized: boolean;
  visible: boolean;
}

export async function readDesktopWindowState(
  label: 'main' | 'call'
): Promise<DesktopWindowState> {
  const snapshot = await invoke<DesktopWindowState>('desktop_window_state', {
    label
  });
  if (
    !snapshot ||
    (snapshot.label && snapshot.label !== label) ||
    typeof snapshot.focused !== 'boolean' ||
    typeof snapshot.minimized !== 'boolean' ||
    typeof snapshot.visible !== 'boolean'
  )
    throw new Error('Не удалось определить состояние окна чата');
  return snapshot;
}

export const isDesktopWindowActive = (snapshot: DesktopWindowState): boolean =>
  snapshot.visible && !snapshot.minimized && snapshot.focused;
