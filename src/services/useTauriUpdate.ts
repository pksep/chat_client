import {
  check,
  type DownloadEvent,
  type Update
} from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { isTauriRuntime } from './useTauriNotifications';

export interface TauriUpdateInfo {
  body?: string;
  currentVersion: string;
  date?: string;
  version: string;
}

let pendingUpdate: Update | null = null;

const toUpdateInfo = (update: Update): TauriUpdateInfo => ({
  body: update.body,
  currentVersion: update.currentVersion,
  date: update.date,
  version: update.version
});

export const checkTauriUpdate = async (): Promise<TauriUpdateInfo | null> => {
  if (!isTauriRuntime()) {
    return null;
  }

  const update = await check();
  pendingUpdate = update;

  return update ? toUpdateInfo(update) : null;
};

export const installTauriUpdate = async (
  onEvent?: (event: DownloadEvent) => void
): Promise<boolean> => {
  if (!isTauriRuntime()) {
    return false;
  }

  const update = pendingUpdate ?? (await check());

  if (!update) {
    pendingUpdate = null;
    return false;
  }

  pendingUpdate = update;
  await update.downloadAndInstall(onEvent);
  pendingUpdate = null;
  await relaunch();

  return true;
};
