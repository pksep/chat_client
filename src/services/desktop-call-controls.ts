import { computed, ref, watch } from 'vue';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  isCalling,
  isIncoming,
  open,
  state,
  requestCallPresentation
} from './useCallState';
import type { DesktopCallActions } from '../components/Desktop/call-window-context';
import { getDesktopPermissionChoice } from './desktop-permission-preferences';

export type DesktopCallDevice = 'microphone' | 'camera' | 'screen';
export const desktopCallControlBusy = ref(false);
export const canControlDesktopCall = computed(
  () => open.value && !isCalling.value && !isIncoming.value
);

const actionNames = {
  microphone: 'toggleMic',
  camera: 'toggleVideo',
  screen: 'toggleScreenShare'
} as const;

export async function toggleDesktopCallDevice(
  device: DesktopCallDevice,
  actions?: Partial<DesktopCallActions>
) {
  if (!canControlDesktopCall.value || desktopCallControlBusy.value) return;
  desktopCallControlBusy.value = true;
  try {
    const controls = actions || (await import('./useLiveKit'));
    await controls[actionNames[device]]?.();
  } catch (error) {
    console.warn('Не удалось переключить устройство звонка:', error);
  } finally {
    desktopCallControlBusy.value = false;
  }
}

export async function installDesktopCallControls(
  options: {
    actions?: Partial<DesktopCallActions>;
  } = {}
): Promise<() => void> {
  if (!isTauri()) return () => {};
  const stopWatch = watch(
    () => ({
      enabled: canControlDesktopCall.value && !desktopCallControlBusy.value,
      microphone: open.value && state.isMicActive,
      camera: open.value && state.isVideoActive,
      screen: open.value && state.isScreenSharingActive
    }),
    snapshot => {
      void invoke('desktop_sync_call_controls', { snapshot }).catch(error =>
        console.warn('Не удалось обновить управление звонком в трее:', error)
      );
    },
    { immediate: true }
  );
  try {
    const unlisten = await listen<DesktopCallDevice>(
      'sep-chat://call-device-action',
      event => {
        const device = event.payload;
        if (!Object.hasOwn(actionNames, device) || !canControlDesktopCall.value)
          return;
        // Выбор источника и запрос разрешения должны появиться в видимом окне.
        if (
          (device === 'microphone' &&
            !state.isMicActive &&
            getDesktopPermissionChoice('microphone') !== 'granted') ||
          (device === 'camera' &&
            !state.isVideoActive &&
            getDesktopPermissionChoice('camera') !== 'granted') ||
          (device === 'screen' && !state.isScreenSharingActive)
        )
          requestCallPresentation();
        void toggleDesktopCallDevice(device, options.actions);
      }
    );
    return () => {
      stopWatch();
      unlisten();
    };
  } catch (error) {
    stopWatch();
    console.warn('Не удалось подключить управление звонком в трее:', error);
    return () => {};
  }
}
