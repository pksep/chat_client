import { watch } from 'vue';
import { isTauri } from '@tauri-apps/api/core';
import {
  getCurrentWindow,
  Window as NativeWindow
} from '@tauri-apps/api/window';
import { Room, RoomEvent, Track } from 'livekit-client';
import {
  applyDesktopScreenShareSubscription,
  getScreenSharePublishDefaults
} from '../../src/services/call-screen-share-quality';
import { authedUser } from '../../src/composables/useAuth';
import { initializeChat, getChatSDK } from '../../src/services/useChat';
import { ChatSDK } from '../../src/services/useChatSDK';
import { setConfig } from '../../src/services/useConfig';
import * as calls from '../../src/services/useLiveKit';

const query = new URLSearchParams(location.search);
const peer = query.has('peer');
const api = 'http://127.0.0.1:5209';
const ws = 'ws://127.0.0.1:17880';
const identity = `${isTauri() ? 'native' : 'browser'}-qa-quality-${peer ? 'peer' : 'main'}`;
const canvas = document.querySelector<HTMLCanvasElement>('#source')!;
const context = canvas.getContext('2d')!;
const mainVideo = document.querySelector<HTMLVideoElement>('#remote')!;
const output = document.querySelector<HTMLPreElement>('#result')!;
let frames = 0;
let drawn = 0;
let nativeHost: Window | null = null;
let childVideo: HTMLVideoElement | null = null;
let thumbnail: HTMLVideoElement | null = null;
let remoteStream: MediaStream | null = null;
let connectedRoom: Room | null = null;
let sourceStream: MediaStream | null = null;
const capture = () => {
  sourceStream = canvas.captureStream(0);
  return sourceStream;
};
const received: { width: number; height: number }[] = [];
const timer = setInterval(() => {
  context.fillStyle = '#fff';
  context.fillRect(0, 0, 1280, 720);
  context.fillStyle = '#123456';
  context.font = '24px sans-serif';
  for (let y = 35; y < 700; y += 32)
    context.fillText(
      `Чёткий текст: заказ 2847 / строка ${y} / кадр ${++drawn}`,
      20,
      y
    );
  // Как в нативном захвате: кадр отправляется и при неактивном основном окне.
  for (const track of sourceStream?.getVideoTracks() || [])
    (track as CanvasCaptureMediaStreamTrack).requestFrame();
}, 100);
const observeFrames = (video: HTMLVideoElement) => {
  const frame = () => {
    frames++;
    received.push({ width: video.videoWidth, height: video.videoHeight });
    video.requestVideoFrameCallback(frame);
  };
  video.requestVideoFrameCallback(frame);
};
observeFrames(mainVideo);
const token = async (room: string) => {
  const response = await fetch(
    `${api}/token?room=${encodeURIComponent(room)}&identity=${identity}`
  );
  if (!response.ok)
    throw new Error(`Токен локальной проверки: ${response.status}`);
  return (await response.json()).token as string;
};
const showStream = (stream: MediaStream) => {
  remoteStream = stream;
  for (const video of [mainVideo, childVideo, thumbnail]) {
    if (!video) continue;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
  }
};
const openWindow = async () => {
  if (!isTauri()) return;
  nativeHost = window.open(
    'about:blank#sep-chat-call',
    'sep-chat-call',
    'popup,width=1000,height=800'
  );
  if (!nativeHost) throw new Error('Тестовое окно не открылось');
  nativeHost.document.title = 'Синтетическая демонстрация — СЭП Чат';
  childVideo = nativeHost.document.createElement('video');
  thumbnail = nativeHost.document.createElement('video');
  for (const video of [childVideo, thumbnail]) {
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    nativeHost.document.body.append(video);
  }
  childVideo.style.cssText = 'width:900px;height:506px';
  thumbnail.style.cssText = 'width:180px;height:102px';
  observeFrames(childVideo);
  if (remoteStream) showStream(remoteStream);
  await new NativeWindow('call').show();
};
const start = async () => {
  if (connectedRoom) return;
  if (peer) {
    const room = new Room({ adaptiveStream: false });
    connectedRoom = room;
    room.on(RoomEvent.TrackSubscribed, track => {
      if (track.kind === Track.Kind.Video)
        showStream(new MediaStream([track.mediaStreamTrack]));
    });
    const name = query.get('room')!;
    await room.connect(ws, await token(name));
  } else {
    authedUser.value = { id: identity, name: 'Синтетическая проверка' } as any;
    setConfig({ CHAT_API_DOMAIN: api, CHAT_LIVEKIT_URL: ws });
    ChatSDK.prototype.connect = () => new Promise<void>(() => {});
    await initializeChat({
      userId: identity,
      token: 'synthetic-only',
      apiUrl: api,
      wsUrl: 'ws://127.0.0.1:65530'
    });
    const sdk = getChatSDK()!;
    sdk.getLiveKitToken = name => token(name);
    sdk.sendWebSocketEventWithAck = async (_type, payload: any) =>
      ({
        accepted: true,
        roomId: payload.roomId,
        startTime: Date.now()
      }) as any;
    sdk.sendWebSocketEvent = () => true;
    sdk.getLiveKitCallStatus = async () => ({ active: true }) as any;
    localStorage.setItem(
      'chat.desktop.permissions.v1',
      JSON.stringify({ 'screen-capture': 'granted' })
    );
    navigator.mediaDevices.getDisplayMedia = async () => capture();
    calls.state.isMicActive = false;
    calls.state.isVideoActive = false;
    watch(
      calls.remoteParticipants,
      peers => {
        const remote = peers.find(p => p.screenShareStream);
        if (remote?.screenShareStream) {
          showStream(remote.screenShareStream);
          for (const video of [mainVideo, childVideo, thumbnail])
            if (video)
              calls.updateRemoteVideoSubscription(
                remote.identity,
                'screen',
                video
              );
        }
      },
      { deep: true }
    );
    await calls.startStandaloneMeetingCall();
    await calls.toggleScreenShare();
    await openWindow();
  }
  output.textContent = 'Локальная комната готова';
};
const resize = () => {
  const remote = calls.remoteParticipants.value.find(p => p.screenShareStream);
  for (const [width, height] of [
    [1280, 720],
    [180, 102],
    [1920, 1080],
    [60, 60]
  ]) {
    mainVideo.style.width = `${width}px`;
    mainVideo.style.height = `${height}px`;
    if (remote)
      calls.updateRemoteVideoSubscription(remote.identity, 'screen', mainVideo);
    if (peer && connectedRoom)
      for (const p of connectedRoom.remoteParticipants.values())
        for (const publication of p.videoTrackPublications.values())
          applyDesktopScreenShareSubscription(publication, true, 'screen');
  }
};
(window as any).screenQuality = {
  start,
  resize,
  stopScreen: () => calls.toggleScreenShare(),
  publishScreen: () =>
    connectedRoom!.localParticipant
      .publishTrack(capture().getVideoTracks()[0], {
        ...getScreenSharePublishDefaults(true),
        source: Track.Source.ScreenShare
      })
      .then(() => undefined),
  snapshot: () => ({
    native: isTauri(),
    roomId: calls.roomId.value || query.get('room'),
    frames,
    drawn,
    width: mainVideo.videoWidth,
    height: mainVideo.videoHeight,
    sizes: received.slice(-60),
    openWindow: !!nativeHost && !nativeHost.closed
  }),
  minimizeMain: () => getCurrentWindow().minimize(),
  cleanup: async () => {
    clearInterval(timer);
    sourceStream?.getTracks().forEach(track => track.stop());
    if (peer) await connectedRoom?.disconnect();
    else await calls.leaveCall();
    nativeHost?.close();
  }
};
document.querySelector('#start')!.addEventListener('click', () => {
  void start().catch(error => {
    output.textContent = String(error);
  });
});
document.querySelector('#resize')!.addEventListener('click', resize);
