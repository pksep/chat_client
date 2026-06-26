import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type AudioOutputRoute = 'auto' | 'bluetooth' | 'earpiece' | 'speaker';

export type AudioOutputState = {
  currentRoute: Exclude<AudioOutputRoute, 'auto'>;
  defaultRoute: Exclude<AudioOutputRoute, 'auto'>;
  availableRoutes: Array<Exclude<AudioOutputRoute, 'auto'>>;
  bluetoothAvailable: boolean;
};

export const AudioOutput = registerPlugin<{
  addListener(
    eventName: 'audioRouteChanged',
    listenerFunc: (state: AudioOutputState) => void
  ): Promise<PluginListenerHandle>;
  getState(): Promise<AudioOutputState>;
  setRoute(options: { route: AudioOutputRoute }): Promise<AudioOutputState>;
  toggleAudio(options: { useSpeaker: boolean }): Promise<AudioOutputState>;
}>('AudioOutput');
