import { calculateRootMeanSquare, encodeLinearPcm } from './aiSpeech';
import { VoiceActivity, type VoiceActivityCallbacks } from './voiceActivity';

export interface VoiceMicrophone {
  mute: (muted: boolean) => void;
  stop: () => void;
}

/** Микрофон остаётся доступным во время ответа, чтобы пользователь мог перебить его. */
export async function openVoiceMicrophone(
  callbacks: VoiceActivityCallbacks
): Promise<VoiceMicrophone> {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error('Браузер не поддерживает запись голоса.');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });
  let context: AudioContext | undefined;

  try {
    context = new AudioContext({ sampleRate: 16_000 });
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(1024, 1, 1);
    const silent = context.createGain();
    silent.gain.value = 0;
    const activity = new VoiceActivity(callbacks);
    let muted = false;
    let stopped = false;
    const sampleRate = context.sampleRate;

    processor.onaudioprocess = (event): void => {
      if (muted || stopped) return;
      const input = event.inputBuffer.getChannelData(0);
      activity.push(
        encodeLinearPcm([input], input.length, sampleRate),
        calculateRootMeanSquare(input)
      );
    };
    source.connect(processor);
    processor.connect(silent);
    silent.connect(context.destination);

    return {
      mute: (value): void => {
        muted = value;
        activity.reset();
        stream.getAudioTracks().forEach(track => {
          track.enabled = !value;
        });
      },
      stop: (): void => {
        if (stopped) return;
        stopped = true;
        processor.onaudioprocess = null;
        source.disconnect();
        processor.disconnect();
        silent.disconnect();
        activity.reset();
        stream.getTracks().forEach(track => track.stop());
        void context?.close();
      }
    };
  } catch (error) {
    stream.getTracks().forEach(track => track.stop());
    void context?.close();
    throw error;
  }
}
