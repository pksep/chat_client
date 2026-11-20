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
  onFailure?: (
    stage: 'check' | 'download' | 'install' | 'restart',
    error: unknown
  ) => void;
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
      // Старый ответ CDN не отменяет уже найденный релиз в работающем приложении.
      if (!next && state.value.version) {
        patch({
          phase: update ? 'available' : 'error',
          error: update ? '' : DESKTOP_UPDATE_MESSAGES.temporarilyUnavailable
        });
        return;
      }
      await release();
      update = next;
      patch({
        phase: next ? 'available' : 'latest',
        version: next?.version ?? '',
        notes: next?.body ?? ''
      });
    } catch (error) {
      deps.onFailure?.('check', error);
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
    } catch (error) {
      deps.onFailure?.('download', error);
      await release();
      patch({
        phase: 'error',
        progress: null,
        error: DESKTOP_UPDATE_MESSAGES.downloadFailed
      });
    }
  };

  const check = (): Promise<void> => {
    if (downloaded || state.value.phase === 'installing') {
      return pending ?? Promise.resolve();
    }
    return run(async () => {
      await findUpdate();
      if (update && state.value.phase === 'available') await download();
    });
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
    } catch (error) {
      deps.onFailure?.(installed ? 'restart' : 'install', error);
      patch({
        phase: 'downloaded',
        error: installed
          ? DESKTOP_UPDATE_MESSAGES.restartFailed
          : DESKTOP_UPDATE_MESSAGES.installFailed
      });
    }
  };

  // Клик до готовности пакета только повторяет подготовку: он не даёт согласия
  // на установку после завершения фоновой загрузки.
  const act = () => {
    if (!downloaded || !update) return check();
    return run(install);
  };

  return { state, check, act };
}
