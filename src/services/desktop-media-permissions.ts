import { invoke, isTauri } from '@tauri-apps/api/core';
import { shallowRef } from 'vue';
import {
  getDesktopPermissionChoice,
  restoreDesktopWebviewPermissions,
  saveDesktopPermissionChoice
} from './desktop-permission-preferences';

export type DesktopMediaPermission = 'microphone' | 'camera';

export const desktopMediaPermissionRequest = shallowRef<{
  permissions: DesktopMediaPermission[];
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

const ask = (
  permissions: DesktopMediaPermission[],
  isActive: () => boolean
): Promise<boolean> => {
  const task = queue.then(async () => {
    if (!isActive()) return false;
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
    if (!allowed || !isActive()) return false;
    await invoke('desktop_grant_media_permissions', { permissions: missing });
    if (!isActive()) return false;
    missing.forEach(permission => {
      granted.add(permission);
      saveDesktopPermissionChoice(permission, 'granted');
    });
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
  if (!isTauri() || !navigator.mediaDevices?.getUserMedia) return () => {};
  try {
    // В dev-режиме интерфейс может работать со старой нативной оболочкой.
    if (!(await invoke<boolean>('desktop_media_permissions_available')))
      return () => {};
  } catch {
    return () => {};
  }
  await restoreDesktopWebviewPermissions();
  const devices = navigator.mediaDevices;
  const original = devices.getUserMedia;
  let active = true;
  const wrapped: MediaDevices['getUserMedia'] = async constraints => {
    const permissions: DesktopMediaPermission[] = [];
    if (constraints?.audio) permissions.push('microphone');
    if (constraints?.video) permissions.push('camera');
    if (permissions.length && !(await ask(permissions, () => active)))
      throw new DOMException('Доступ к устройству отклонён', 'NotAllowedError');
    return original.call(devices, constraints);
  };
  devices.getUserMedia = wrapped;
  return () => {
    active = false;
    resolveDesktopMediaPermission(false);
    if (devices.getUserMedia === wrapped) devices.getUserMedia = original;
  };
};
