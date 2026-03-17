import { registerPlugin } from '@capacitor/core';

export const AudioOutput = registerPlugin<{
  toggleAudio(options: { useSpeaker: boolean }): Promise<void>;
}>('AudioOutput');
