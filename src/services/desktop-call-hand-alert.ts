import {
  UserAttentionType,
  type Window as TauriWindow
} from '@tauri-apps/api/window';
import type { CallRenderWindow } from '../components/Desktop/call-window-context';

export function createDesktopCallHandAlert(options: {
  renderWindow: CallRenderWindow;
  nativeWindow: Pick<TauriWindow, 'requestUserAttention'>;
}) {
  const host = options.renderWindow;
  let audio: AudioContext | null = null;
  let disposed = false;
  let lastSoundAt = -Infinity;
  const tones = new Set<OscillatorNode>();
  try {
    audio = new host.AudioContext({ latencyHint: 'interactive' });
  } catch {
    /* Останется системный звук уведомления. */
  }
  const resume = () => {
    if (audio?.state === 'suspended') void audio.resume().catch(() => {});
  };
  resume();
  host.addEventListener('pointerdown', resume, true);
  host.addEventListener('keydown', resume, true);
  return {
    play(): boolean {
      if (disposed) return false;
      void options.nativeWindow
        .requestUserAttention(UserAttentionType.Informational)
        .catch(error => {
          console.warn('Не удалось подсветить значок звонка:', error);
        });
      if (Date.now() - lastSoundAt < 1500) return true;
      if (!audio || audio.state !== 'running') {
        resume();
        return false;
      }
      try {
        const start = audio.currentTime + 0.01;
        for (const [offset, frequency] of [
          [0, 660],
          [0.13, 880]
        ]) {
          const tone = audio.createOscillator();
          const gain = audio.createGain();
          const at = start + offset;
          tone.type = 'sine';
          tone.frequency.setValueAtTime(frequency, at);
          gain.gain.setValueAtTime(0.0001, at);
          gain.gain.exponentialRampToValueAtTime(0.1, at + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
          tone.connect(gain).connect(audio.destination);
          tones.add(tone);
          tone.onended = () => {
            tones.delete(tone);
            tone.disconnect();
            gain.disconnect();
          };
          tone.start(at);
          tone.stop(at + 0.12);
        }
        lastSoundAt = Date.now();
        return true;
      } catch (error) {
        console.warn('Не удалось воспроизвести сигнал поднятой руки:', error);
        return false;
      }
    },
    clearAttention() {
      if (!disposed)
        void options.nativeWindow.requestUserAttention(null).catch(() => {});
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      host.removeEventListener('pointerdown', resume, true);
      host.removeEventListener('keydown', resume, true);
      void options.nativeWindow.requestUserAttention(null).catch(() => {});
      tones.forEach(tone => {
        try {
          tone.stop();
        } catch {
          /* Тон уже завершился. */
        }
      });
      tones.clear();
      void audio?.close().catch(() => {});
      audio = null;
    }
  };
}
