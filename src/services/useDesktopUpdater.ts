import { getVersion } from '@tauri-apps/api/app';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { computed, nextTick, ref } from 'vue';
import { createDesktopUpdater } from './desktop-updater';
import { DESKTOP_UPDATE_MESSAGES } from './desktop-update-messages';
import { hasActiveWebUpdateOperations } from './web-update-activity';
import { getTelemetryErrorPayload, recordTelemetryEvent } from './useTelemetry';
import {
  activeCallTopicId,
  isAnyCallDialing,
  isAnyCallIncoming,
  isAnyCallModalVisible,
  isCallActive
} from './useCallState';

export const desktopAppVersion = ref('');
export const desktopInstallBlockers = new Set<() => string>();
export const desktopBeforeInstall = new Set<() => void | Promise<void>>();
export const hasDesktopAttachmentPreviews = () =>
  Boolean(
    document.querySelector(
      '.attach-modal__media-tile, .attach-modal__attachment-name'
    )
  );

const blockingReason = () => {
  if (
    isCallActive.value ||
    isAnyCallDialing.value ||
    isAnyCallIncoming.value ||
    isAnyCallModalVisible.value ||
    activeCallTopicId.value
  )
    return DESKTOP_UPDATE_MESSAGES.activeCall;
  if (hasActiveWebUpdateOperations()) {
    return DESKTOP_UPDATE_MESSAGES.fileTransfer;
  }
  if (hasDesktopAttachmentPreviews()) {
    return DESKTOP_UPDATE_MESSAGES.draftAttachments;
  }
  for (const check of desktopInstallBlockers) {
    const reason = check();
    if (reason) return reason;
  }
  return '';
};

export const desktopUpdater = createDesktopUpdater({
  check: async () => {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check({ timeout: 20_000 });
    if (!update) return null;
    return {
      version: update.version,
      body: update.body,
      download: onEvent =>
        update.download(onEvent, { timeout: 30 * 60 * 1000 }),
      install: () => update.install(),
      close: () => update.close()
    };
  },
  blockingReason,
  prepareToInstall: async () => {
    await nextTick();
    for (const save of desktopBeforeInstall) await save();
    // Нативные передачи могут продолжаться после закрытия их UI.
    await invoke('desktop_update_prepare');
  },
  relaunch: async () => {
    await invoke('desktop_restart');
  },
  onFailure: (stage, error) => {
    recordTelemetryEvent({
      category: 'app',
      name: `app.update.desktop.${stage}_failed`,
      level: 'error',
      entityType: 'app_update',
      payload: {
        currentVersion: desktopAppVersion.value,
        targetVersion: desktopUpdater.state.value.version,
        ...getTelemetryErrorPayload(error)
      }
    });
  }
});

export const desktopUpdateVisible = computed(() =>
  ['available', 'downloading', 'downloaded', 'installing'].includes(
    desktopUpdater.state.value.phase
  )
);

let consumers = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let lastCheck = 0;
const interval = 60 * 60 * 1000;
const checkWhenActive = () => {
  if (
    !consumers ||
    !navigator.onLine ||
    document.visibilityState !== 'visible' ||
    Date.now() - lastCheck < interval
  )
    return;
  lastCheck = Date.now();
  void desktopUpdater.check();
};
const checkWhenOnline = () => {
  lastCheck = 0;
  checkWhenActive();
};

export const startDesktopUpdater = async () => {
  if (!isTauri()) return;
  consumers += 1;
  if (consumers > 1) return;
  window.addEventListener('online', checkWhenOnline);
  window.addEventListener('focus', checkWhenActive);
  document.addEventListener('visibilitychange', checkWhenActive);
  timer = setInterval(checkWhenActive, interval);
  try {
    desktopAppVersion.value = await getVersion();
  } catch {
    desktopAppVersion.value = '';
  }
  checkWhenActive();
};

export const stopDesktopUpdater = () => {
  if (!isTauri()) return;
  consumers = Math.max(0, consumers - 1);
  if (consumers) return;
  if (timer) clearInterval(timer);
  timer = null;
  window.removeEventListener('online', checkWhenOnline);
  window.removeEventListener('focus', checkWhenActive);
  document.removeEventListener('visibilitychange', checkWhenActive);
};
