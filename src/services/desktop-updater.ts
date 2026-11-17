import { shallowRef } from 'vue';
import { DESKTOP_UPDATE_MESSAGES } from './desktop-update-messages';

export type DesktopUpdatePhase =
  | 'idle'
  | 'checking'
  | 'latest'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

type DownloadEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' };

export interface DesktopUpdateResource {
  version: string;
  body?: string;
  download: (onEvent: (event: DownloadEvent) => void) => Promise<void>;
  install: () => Promise<void>;
  close: () => Promise<void>;
}

export interface DesktopUpdateDependencies {
  check: () => Promise<DesktopUpdateResource | null>;
  blockingReason: () => string;
  prepareToInstall: () => Promise<void>;
  relaunch: () => Promise<void>;
}

export interface DesktopUpdateState {
  phase: DesktopUpdatePhase;
  version: string;
  notes: string;
  progress: number | null;
  error: string;
}

// Один ресурс обновления на приложение: повторные клики не запускают второй запрос.
export function createDesktopUpdater(deps: DesktopUpdateDependencies) {
  const state = shallowRef<DesktopUpdateState>({
    phase: 'idle',
    version: '',
    notes: '',
    progress: null,
    error: ''
  });
  let update: DesktopUpdateResource | null = null;
  let downloaded = false;
  let installed = false;
  let pending: Promise<void> | null = null;
  const patch = (value: Partial<DesktopUpdateState>) => {
    state.value = { ...state.value, ...value };
  };
  const release = async () => {
    const previous = update;
    update = null;
    downloaded = false;
    installed = false;
    if (previous) await previous.close().catch(() => undefined);
  };

  const findUpdate = async () => {
    patch({ phase: 'checking', error: '', progress: null });
    try {
      const next = await deps.check();
      await release();
      update = next;
      patch({
        phase: next ? 'available' : 'latest',
        version: next?.version ?? '',
        notes: next?.body ?? ''
      });
    } catch {
      patch({
        phase: 'error',
        error: DESKTOP_UPDATE_MESSAGES.checkFailed
      });
    }
  };

  const run = (operation: () => Promise<void>) => {
    if (pending) return pending;
    pending = operation().finally(() => {
      pending = null;
    });
    return pending;
  };

  const check = (manual = false): Promise<void> => {
    if (downloaded || state.value.phase === 'installing') {
      return pending ?? Promise.resolve();
    }
    if (!manual && update) return Promise.resolve();
    return run(findUpdate);
  };

  const download = async () => {
    if (!update) return;
    let total = 0;
    let received = 0;
    patch({ phase: 'downloading', progress: null, error: '' });
    try {
      await update.download(event => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0;
        if (event.event === 'Progress') received += event.data.chunkLength;
        // Finished означает конец передачи; доверять пакету можно лишь после
        // успешного возврата download(), когда нативный плагин проверил подпись.
        patch({
          progress:
            total > 0
              ? Math.min(99, Math.floor((received / total) * 100))
              : null
        });
      });
      downloaded = true;
      patch({ phase: 'downloaded', progress: null });
    } catch {
      await release();
      patch({
        phase: 'error',
        progress: null,
        error: DESKTOP_UPDATE_MESSAGES.downloadFailed
      });
    }
  };

  const install = async () => {
    const blocked = deps.blockingReason();
    if (blocked) {
      patch({ error: blocked });
      return;
    }
    patch({ phase: 'installing', error: '' });
    try {
      await deps.prepareToInstall();
      // Пока сохранялись черновики, мог начаться звонок или загрузка.
      const blockedAfterSave = deps.blockingReason();
      if (blockedAfterSave) {
        patch({ phase: 'downloaded', error: blockedAfterSave });
        return;
      }
      if (!installed) {
        await update!.install();
        installed = true;
      }
      // Windows сам завершает приложение и запускает установщик.
      await deps.relaunch();
    } catch {
      patch({
        phase: 'downloaded',
        error: installed
          ? DESKTOP_UPDATE_MESSAGES.restartFailed
          : DESKTOP_UPDATE_MESSAGES.installFailed
      });
    }
  };

  const act = () =>
    run(async () => {
      if (downloaded && update) {
        await install();
        return;
      }
      if (!update) await findUpdate();
      if (update) await download();
    });

  return { state, check, act };
}
