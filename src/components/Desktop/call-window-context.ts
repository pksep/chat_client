import { inject, type InjectionKey, type Ref } from 'vue';
import type { Window as TauriWindow } from '@tauri-apps/api/window';
import type { CallReaction } from '../../services/useCallState';

export type CallRenderWindow = Window & typeof globalThis;

export interface DesktopCallActions {
  acceptCall: () => unknown;
  leaveCall: () => unknown;
  toggleMic: () => unknown;
  toggleVideo: () => unknown;
  toggleScreenShare: () => unknown;
  switchCamera: () => unknown;
  toggleHandRaise: () => unknown;
  sendCallReaction: (reaction: CallReaction) => unknown;
}

export interface DesktopCallWindowContext {
  renderWindow: CallRenderWindow;
  nativeWindow: TauriWindow;
  width: Ref<number>;
  fullscreen: Ref<boolean>;
  alwaysOnTop: Ref<boolean>;
  pinSupported: boolean;
  pinChanging: Ref<boolean>;
  toggleAlwaysOnTop: () => Promise<void>;
  microphoneLevel: Ref<number>;
  microphoneSpeaking: Ref<boolean>;
  contextMenuOpen: Ref<boolean>;
  actions: Partial<DesktopCallActions>;
  toggleFullscreen: () => Promise<void>;
  setFullscreen: (enabled: boolean) => Promise<void>;
  showMain: () => Promise<void>;
}

export const desktopCallWindowContextKey: InjectionKey<DesktopCallWindowContext> =
  Symbol('desktop-call-window');

export const useDesktopCallWindowContext = () =>
  inject(desktopCallWindowContextKey, null);
