import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type AudioOutputRoute = 'auto' | 'bluetooth' | 'earpiece' | 'speaker';

export type AudioOutputState = {
  currentRoute: Exclude<AudioOutputRoute, 'auto'>;
  defaultRoute: Exclude<AudioOutputRoute, 'auto'>;
  availableRoutes: Array<Exclude<AudioOutputRoute, 'auto'>>;
  bluetoothAvailable: boolean;
  callAudioActive?: boolean;
  audioMode?: string;
  audioModeValue?: number;
  volumeControlStream?: string;
  volumeControlStreamValue?: number;
  voiceCallVolume?: number;
  voiceCallMaxVolume?: number;
  musicVolume?: number;
  musicMaxVolume?: number;
  speakerphoneOn?: boolean;
  bluetoothScoOn?: boolean;
  wiredHeadsetConnected?: boolean;
  activeOutputType?: string;
  activeOutputName?: string;
};

export const AudioOutput = registerPlugin<{
  addListener(
    eventName: 'audioRouteChanged',
    listenerFunc: (state: AudioOutputState) => void
  ): Promise<PluginListenerHandle>;
  getState(): Promise<AudioOutputState>;
  setRoute(options: { route: AudioOutputRoute }): Promise<AudioOutputState>;
  toggleAudio(options: { useSpeaker: boolean }): Promise<AudioOutputState>;
  releaseCallAudio(): Promise<void>;
}>('AudioOutput');
