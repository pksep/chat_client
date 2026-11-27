import { createApp, h, ref, watch } from 'vue';
import { createPinia } from 'pinia';
import CallModal from '../../src/components/CallModal/CallModal.vue';
import { openDesktopCallWindow } from '../../src/services/desktop-call-window';
import { setConfig } from '../../src/services/useConfig';
import { setAuthUser } from '../../src/composables/useAuth';
import { useTopics } from '../../src/composables/useTopics';
import * as call from '../../src/services/useCallState';
import '../../src/assets/chat-container.css';

setConfig({ CHAT_API_DOMAIN: `${location.origin}/mic-fixture-api` });
setAuthUser({ id: 'mic-fixture-me', initials: 'Вы' } as any);
useTopics().setTopics([
  { id: 'mic-fixture-topic', type: 'DM', name: 'Первый звонок' } as any
]);
call.topicId.value = 'mic-fixture-topic';
call.roomId.value = 'mic-fixture-room';
call.user.value = { id: 'mic-fixture-peer', initials: 'Собеседник' } as any;
call.remoteParticipants.value = [
  {
    identity: 'mic-fixture-peer',
    name: 'Собеседник',
    videoStream: null,
    cameraStream: null,
    screenShareStream: null,
    audioStream: null,
    isVideoActive: false,
    isScreenShareActive: false,
    isHandRaised: false,
    activeReaction: null,
    activeReactionExpiresAt: null,
    isSpeaking: false,
    audioLevel: 0,
    isMicActive: true,
    connectionQuality: 'excellent'
  }
];
call.open.value = true;
call.isModalVisible.value = true;
const separate = new URLSearchParams(location.search).has('separate');
const mounted = ref(true);
const app = createApp({
  render: () =>
    !separate && mounted.value
      ? h(CallModal)
      : h('p', 'Синтетическая проверка звонка')
});
app.use(createPinia()).mount('#app');
let target = window;
let host: Awaited<ReturnType<typeof openDesktopCallWindow>>;
if (separate) {
  host = await openDesktopCallWindow({
    appContext: app._context,
    signal: new AbortController().signal,
    getMicrophoneTrack: () => call.localMicrophoneTrack.value,
    actions: {
      toggleMic: () => {
        call.state.isMicActive = !call.state.isMicActive;
      }
    }
  });
  if (!host) throw new Error('Не открылось отдельное окно');
  target = host.popup;
  await host.show();
}
let audio: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
const startSignal = () => {
  if (audio) {
    void audio.resume();
    return;
  }
  audio = new target.AudioContext();
  const destination = audio.createMediaStreamDestination();
  const gain = audio.createGain();
  gain.gain.value = 0.2;
  oscillator = audio.createOscillator();
  oscillator.connect(gain).connect(destination);
  oscillator.start();
  const track = destination.stream.getAudioTracks()[0];
  track.enabled = call.state.isMicActive;
  call.localMicrophoneTrack.value = track;
  void audio.resume();
};
target.document.addEventListener('pointerdown', startSignal, true);
watch(
  () => call.state.isMicActive,
  enabled => {
    if (call.localMicrophoneTrack.value)
      call.localMicrophoneTrack.value.enabled = enabled;
  },
  { flush: 'sync' }
);
Object.assign(window, {
  firstMicFixture: {
    state: call.state,
    diagnostics() {
      return {
        sourceState: audio?.state,
        sourceTime: audio?.currentTime,
        trackState: call.localMicrophoneTrack.value?.readyState,
        trackEnabled: call.localMicrophoneTrack.value?.enabled,
        microphoneEnabled: call.state.isMicActive,
        measuredLevel: host?.context.microphoneLevel.value,
        measuredSpeaking: host?.context.microphoneSpeaking.value,
        focused: target.document.hasFocus(),
        visibility: target.document.visibilityState
      };
    },
    async stop() {
      call.open.value = false;
      mounted.value = false;
      await host?.dispose();
      return call.localMicrophoneTrack.value?.readyState;
    },
    cleanup() {
      target.document.removeEventListener('pointerdown', startSignal, true);
      call.localMicrophoneTrack.value?.stop();
      oscillator?.stop();
      void audio?.close();
    }
  }
});
