import { watch } from 'vue';
import { isTauri } from '@tauri-apps/api/core';
import { Room, RoomEvent } from 'livekit-client';
import { authedUser } from '../../src/composables/useAuth';
import { initializeChat, getChatSDK } from '../../src/services/useChat';
import { ChatSDK } from '../../src/services/useChatSDK';
import { setConfig } from '../../src/services/useConfig';
import * as calls from '../../src/services/useLiveKit';
import { createAudioSignalProbe } from './audio-signal-probe';

const api = 'http://127.0.0.1:5209';
const run = new URLSearchParams(location.search).get('run') || 'native';
const identity = `${isTauri() ? 'native' : 'browser'}-qa-${run}`;
const result = document.querySelector<HTMLOutputElement>('#result')!;
const video = document.querySelector<HTMLVideoElement>('#remote')!;
const canvas = document.querySelector<HTMLCanvasElement>('#source')!;
const ctx = canvas.getContext('2d')!;
let frame = 0;
const animation = setInterval(() => {
  ctx.fillStyle = frame % 2 ? '#1d5ada' : '#f3b523';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = '28px system-ui';
  ctx.fillText(`${identity}: ${++frame}`, 12, 85);
}, 100);
const captured: MediaStreamTrack[] = [];
let captures = 0;
const audio = new AudioContext();
const audioProbes = new Map<
  MediaStream,
  ReturnType<typeof createAudioSignalProbe>
>();
const oscillator = audio.createOscillator();
const destination = audio.createMediaStreamDestination();
oscillator.frequency.value = 440;
oscillator.connect(destination);
oscillator.start();
const audioTracks: MediaStreamTrack[] = [];
const getUserMedia = navigator.mediaDevices.getUserMedia.bind(
  navigator.mediaDevices
);
navigator.mediaDevices.getUserMedia = async constraints => {
  if (constraints.audio && !constraints.video) {
    const track = destination.stream.getAudioTracks()[0].clone();
    audioTracks.push(track);
    return new MediaStream([track]);
  }
  return getUserMedia(constraints);
};
let currentRoom: Room | null = null;
const connectionStates: string[] = [];
const observedRooms = new WeakSet<Room>();
const on = Room.prototype.on;
Room.prototype.on = function (...args) {
  // eslint-disable-next-line @typescript-eslint/no-this-alias -- Наблюдаем настоящий Room, созданный useLiveKit.
  currentRoom = this;
  if (!observedRooms.has(this)) {
    observedRooms.add(this);
    on.call(this, RoomEvent.ConnectionStateChanged, state =>
      connectionStates.push(state)
    );
  }
  return on.apply(this, args);
};
navigator.mediaDevices.getDisplayMedia = async () => {
  captures++;
  const stream = canvas.captureStream(10);
  captured.push(...stream.getTracks());
  return stream;
};
const report = async (data: Record<string, unknown>) => {
  result.textContent = JSON.stringify(data, null, 2);
  await fetch(`${api}/reports?run=${encodeURIComponent(run)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
};
const snapshot = () => ({
  roomId: calls.roomId.value,
  open: calls.open.value,
  screenActive: calls.state.isScreenSharingActive,
  captures,
  tracks: captured.map(track => track.readyState),
  micActive: calls.state.isMicActive,
  audioContext: audio.state,
  audioTime: audio.currentTime,
  audioTracks: audioTracks.map(track => track.readyState),
  connectionStates: [...connectionStates]
});
const receivedAudio = async () => {
  let packets = 0;
  let energy = 0;
  let samples = 0;
  for (const participant of currentRoom?.remoteParticipants.values() || []) {
    for (const publication of participant.audioTrackPublications.values()) {
      const stats = await publication.track?.getRTCStatsReport();
      stats?.forEach(stat => {
        if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
          packets += stat.packetsReceived || 0;
          energy += stat.totalAudioEnergy || 0;
          samples += stat.totalSamplesReceived || 0;
        }
      });
    }
  }
  return {
    packets,
    energy,
    samples,
    decodedAudio: [...audioProbes.values()].map(probe => probe.snapshot())
  };
};
let framesReceived = 0;
let previousStream: MediaStream | null = null;
const onFrame = () => {
  framesReceived++;
  if ([1, 5, 20, 50].includes(framesReceived))
    void report({
      step: 'received-frames',
      frames: framesReceived,
      width: video.videoWidth,
      height: video.videoHeight
    });
  video.requestVideoFrameCallback(onFrame);
};
video.requestVideoFrameCallback(onFrame);
watch(
  calls.remoteParticipants,
  participants => {
    const audioStreams = new Set(
      participants.flatMap(peer => (peer.audioStream ? [peer.audioStream] : []))
    );
    for (const [stream, probe] of audioProbes) {
      if (!audioStreams.has(stream)) {
        probe.close();
        audioProbes.delete(stream);
      }
    }
    for (const stream of audioStreams)
      if (!audioProbes.has(stream))
        audioProbes.set(stream, createAudioSignalProbe(audio, stream));
    const stream =
      participants.find(peer => peer.cameraStream)?.cameraStream || null;
    if (stream && stream !== previousStream) {
      previousStream = stream;
      video.srcObject = stream;
      void video.play();
    }
  },
  { deep: true }
);

try {
  authedUser.value = { id: identity, name: 'Локальный тест' } as any;
  setConfig({ CHAT_API_DOMAIN: api, CHAT_LIVEKIT_URL: 'ws://127.0.0.1:17880' });
  ChatSDK.prototype.connect = () => new Promise<void>(() => {});
  await initializeChat({
    userId: identity,
    token: 'local-qa-only',
    apiUrl: api,
    wsUrl: 'ws://127.0.0.1:65530'
  });
  const sdk = getChatSDK()!;
  sdk.getLiveKitToken = async room => {
    const response = await fetch(
      `${api}/token?room=${encodeURIComponent(room)}&identity=${identity}`
    );
    if (!response.ok) throw new Error(`Токен: HTTP ${response.status}`);
    return (await response.json()).token;
  };
  sdk.sendWebSocketEventWithAck = async (_type, payload: any) =>
    ({ accepted: true, roomId: payload.roomId, startTime: Date.now() }) as any;
  sdk.sendWebSocketEvent = () => true;
  sdk.getLiveKitCallStatus = async () => ({ active: true }) as any;
  const start = async () => {
    calls.state.isMicActive = false;
    await calls.startStandaloneMeetingCall();
    if (!calls.roomId.value) throw new Error('Не создана комната');
    await calls.toggleScreenShare();
    await report({ step: 'started', tauri: isTauri(), ...snapshot() });
  };
  await start();
  const poll = async () => {
    try {
      const { command } = await (
        await fetch(`${api}/commands?run=${encodeURIComponent(run)}`)
      ).json();
      if (command === 'cycle-screen') {
        await calls.toggleScreenShare();
        await report({ step: 'screen-stopped', ...snapshot() });
        await calls.toggleScreenShare();
        await report({ step: 'screen-restarted', ...snapshot() });
      } else if (command === 'leave') {
        calls.leaveCall();
        await report({ step: 'left', ...snapshot() });
      } else if (command === 'start') {
        calls.cleanup();
        await start();
      } else if (command === 'mic-on' || command === 'mic-off') {
        await audio.resume();
        if (calls.state.isMicActive !== (command === 'mic-on'))
          await calls.toggleMic();
        await report({ step: command, ...snapshot() });
      } else if (command === 'signal-reconnect') {
        await currentRoom?.simulateScenario('signal-reconnect');
        await report({ step: 'reconnect-requested', ...snapshot() });
      } else if (command === 'stats') {
        await report({
          step: 'stats',
          ...snapshot(),
          receivedAudio: await receivedAudio()
        });
      }
    } catch (error) {
      await report({ step: 'error', message: String(error) });
    }
    setTimeout(poll, 500);
  };
  void poll();
  window.addEventListener('beforeunload', () => {
    clearInterval(animation);
    calls.cleanup();
    for (const probe of audioProbes.values()) probe.close();
    oscillator.stop();
    void audio.close();
  });
} catch (error) {
  await report({ step: 'error', message: String(error) });
}
