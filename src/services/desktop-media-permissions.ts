import { invoke, isTauri } from '@tauri-apps/api/core';
import { shallowRef, watch } from 'vue';
import {
  getDesktopPermissionChoice,
  restoreDesktopWebviewPermissions,
  saveDesktopPermissionChoice
} from './desktop-permission-preferences';

export type DesktopMediaPermission = 'microphone' | 'camera';

export const desktopMediaPermissionRequest = shallowRef<{
  permissions: Array<DesktopMediaPermission | 'screen-capture'>;
} | null>(null);

const granted = new Set<DesktopMediaPermission>();
let queue = Promise.resolve();
let settle: ((allowed: boolean) => void) | null = null;

export const resolveDesktopMediaPermission = (allowed: boolean) => {
  const resolve = settle;
  settle = null;
  desktopMediaPermissionRequest.value = null;
  resolve?.(allowed);
};

export const requestDesktopScreenCaptureConsent = (): Promise<boolean> => {
  const task = queue.then(async () => {
    if (getDesktopPermissionChoice('screen-capture') === 'granted') return true;
    const allowed = await new Promise<boolean>(resolve => {
      settle = resolve;
      desktopMediaPermissionRequest.value = { permissions: ['screen-capture'] };
    });
    if (allowed) await saveDesktopPermissionChoice('screen-capture', 'granted');
    return allowed;
  });
  queue = task.then(
    () => undefined,
    () => undefined
  );
  return task;
};

const ask = (
  permissions: DesktopMediaPermission[],
  isActive: () => boolean
): Promise<boolean> => {
  const task = queue.then(async () => {
    if (
      !isActive() ||
      permissions.some(
        permission => getDesktopPermissionChoice(permission) === 'denied'
      )
    )
      return false;
    const missing = permissions.filter(permission => !granted.has(permission));
    if (!missing.length) return true;
    const needsConfirmation = missing.filter(
      permission => getDesktopPermissionChoice(permission) !== 'granted'
    );
    const allowed =
      !needsConfirmation.length ||
      (await new Promise<boolean>(resolve => {
        settle = resolve;
        desktopMediaPermissionRequest.value = {
          permissions: needsConfirmation
        };
      }));
    if (
      !allowed ||
      !isActive() ||
      permissions.some(
        permission => getDesktopPermissionChoice(permission) === 'denied'
      )
    )
      return false;
    await invoke('desktop_grant_media_permissions', { permissions: missing });
    if (
      !isActive() ||
      permissions.some(
        permission => getDesktopPermissionChoice(permission) === 'denied'
      )
    )
      return false;
    await Promise.all(
      missing.map(async permission => {
        granted.add(permission);
        await saveDesktopPermissionChoice(permission, 'granted');
      })
    );
    return true;
  });
  queue = task.then(
    () => undefined,
    () => undefined
  );
  return task;
};

// Системные разрешения ОС остаются у WebView; заменяем его запрос внутри приложения.
export const installDesktopMediaPermissions = async (): Promise<() => void> => {
  if (!isTauri()) return () => {};
  await restoreDesktopWebviewPermissions();
  if (!navigator.mediaDevices?.getUserMedia) return () => {};
  try {
    // В dev-режиме интерфейс может работать со старой нативной оболочкой.
    if (!(await invoke<boolean>('desktop_media_permissions_available')))
      return () => {};
  } catch {
    return () => {};
  }
  const devices = navigator.mediaDevices;
  const original = devices.getUserMedia;
  let active = true;
  const tracks = new Map<DesktopMediaPermission, Set<MediaStreamTrack>>();
  const stopWatching = watch(
    () => [
      getDesktopPermissionChoice('microphone'),
      getDesktopPermissionChoice('camera')
    ],
    () => {
      for (const permission of ['microphone', 'camera'] as const) {
        if (getDesktopPermissionChoice(permission) !== 'denied') continue;
        granted.delete(permission);
        tracks.get(permission)?.forEach(track => track.stop());
        tracks.delete(permission);
        if (
          desktopMediaPermissionRequest.value?.permissions.includes(permission)
        )
          resolveDesktopMediaPermission(false);
      }
    },
    { flush: 'sync' }
  );
  const wrapped: MediaDevices['getUserMedia'] = async constraints => {
    const permissions: DesktopMediaPermission[] = [];
    if (constraints?.audio) permissions.push('microphone');
    if (constraints?.video) permissions.push('camera');
    if (permissions.length && !(await ask(permissions, () => active)))
      throw new DOMException('Доступ к устройству отклонён', 'NotAllowedError');
    const stream = await original.call(devices, constraints);
    for (const permission of permissions) {
      const captured =
        permission === 'microphone'
          ? stream.getAudioTracks()
          : stream.getVideoTracks();
      if (getDesktopPermissionChoice(permission) === 'denied') {
        stream.getTracks().forEach(track => track.stop());
        throw new DOMException(
          'Доступ к устройству отозван',
          'NotAllowedError'
        );
      }
      const known = tracks.get(permission) ?? new Set<MediaStreamTrack>();
      captured.forEach(track => {
        known.add(track);
        track.addEventListener('ended', () => known.delete(track), {
          once: true
        });
      });
      tracks.set(permission, known);
    }
    return stream;
  };
  devices.getUserMedia = wrapped;
  return () => {
    active = false;
    stopWatching();
    resolveDesktopMediaPermission(false);
    if (devices.getUserMedia === wrapped) devices.getUserMedia = original;
  };
};
