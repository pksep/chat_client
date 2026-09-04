import { registerPlugin } from '@capacitor/core';

interface LaunchStartupPlugin {
  reveal: () => Promise<void>;
  ready: () => Promise<void>;
  setTheme: (options: { dark: boolean }) => Promise<void>;
}

export const LaunchStartup =
  registerPlugin<LaunchStartupPlugin>('LaunchStartup');
