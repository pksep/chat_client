import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle
} from '@capacitor/core';
import { showErrorNotification } from '../composables/useNotifications';

interface KeyboardMediaPayload {
  filePath: string;
  name: string;
  mimeType: string;
}
interface KeyboardMediaPlugin {
  setEnabled(options: { enabled: boolean }): Promise<void>;
  releaseFile(options: { filePath: string }): Promise<void>;
  addListener(
    event: 'mediaReceived',
    listener: (payload: KeyboardMediaPayload) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    event: 'mediaError',
    listener: (payload: { message: string }) => void
  ): Promise<PluginListenerHandle>;
}
const KeyboardMedia = registerPlugin<KeyboardMediaPlugin>('KeyboardMedia');

export const bindKeyboardMedia = async (options: {
  getTargetElement: () => HTMLElement | null;
  onMedia: (file: File) => void;
}): Promise<(() => void) | null> => {
  if (
    Capacitor.getPlatform() !== 'android' ||
    !Capacitor.isNativePlatform() ||
    !Capacitor.isPluginAvailable('KeyboardMedia')
  )
    return null;
  let enabled = false;
  const syncFocus = () => {
    const root = options.getTargetElement();
    const scope = root?.getRootNode();
    const active =
      scope instanceof Document || scope instanceof ShadowRoot
        ? scope.activeElement
        : document.activeElement;
    const next = Boolean(
      root &&
        active instanceof HTMLElement &&
        root.contains(active) &&
        active.matches('.ProseMirror[contenteditable="true"]')
    );
    if (next === enabled) return;
    enabled = next;
    void KeyboardMedia.setEnabled({ enabled }).catch(() => undefined);
  };
  const received = await KeyboardMedia.addListener(
    'mediaReceived',
    async payload => {
      const root = options.getTargetElement();
      try {
        if (!root || !enabled || !root.isConnected) return;
        const response = await fetch(
          Capacitor.convertFileSrc(payload.filePath)
        );
        if (!response.ok)
          throw new Error('Не удалось получить файл из клавиатуры');
        const blob = await response.blob();
        if (!root.isConnected || options.getTargetElement() !== root) return;
        options.onMedia(
          new File([blob], payload.name, { type: payload.mimeType })
        );
      } catch {
        showErrorNotification('Не удалось получить стикер из клавиатуры');
      } finally {
        await KeyboardMedia.releaseFile({ filePath: payload.filePath }).catch(
          () => undefined
        );
      }
    }
  );
  const failed = await KeyboardMedia.addListener('mediaError', payload => {
    if (enabled) showErrorNotification(payload.message);
  });
  document.addEventListener('focusin', syncFocus);
  document.addEventListener('focusout', syncFocus);
  syncFocus();
  return () => {
    enabled = false;
    document.removeEventListener('focusin', syncFocus);
    document.removeEventListener('focusout', syncFocus);
    void KeyboardMedia.setEnabled({ enabled: false }).catch(() => undefined);
    void received.remove();
    void failed.remove();
  };
};
