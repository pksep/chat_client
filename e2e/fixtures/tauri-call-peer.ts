import { Room, RoomEvent, Track } from 'livekit-client';
import { createAudioSignalProbe } from './audio-signal-probe';

const canvas = document.querySelector<HTMLCanvasElement>('#source')!;
const context = canvas.getContext('2d')!;
const video = document.querySelector<HTMLVideoElement>('#remote')!;
const room = new Room({ adaptiveStream: false });
let frames = 0;
let subscriptions = 0;
let drawn = 0;
const states: string[] = [];
const audio = new AudioContext();
const audioProbes = new Map<
  string,
  ReturnType<typeof createAudioSignalProbe>
>();
const oscillator = audio.createOscillator();
const destination = audio.createMediaStreamDestination();
oscillator.frequency.value = 660;
oscillator.connect(destination);
oscillator.start();
setInterval(() => {
  context.fillStyle = drawn % 2 ? '#207b59' : '#d92a6f';
  context.fillRect(0, 0, 320, 180);
  context.fillStyle = 'white';
  context.font = '28px system-ui';
  context.fillText(`Второй участник: ${++drawn}`, 10, 85);
}, 100);
const onFrame = () => {
  frames++;
  video.requestVideoFrameCallback(onFrame);
};
video.requestVideoFrameCallback(onFrame);
room.on(RoomEvent.ConnectionStateChanged, state => states.push(state));
room.on(RoomEvent.TrackSubscribed, track => {
  if (track.kind === Track.Kind.Video) {
    subscriptions++;
    track.attach(video);
  } else if (track.kind === Track.Kind.Audio) {
    audioProbes.get(track.sid!)?.close();
    const probe = createAudioSignalProbe(
      audio,
      new MediaStream([track.mediaStreamTrack])
    );
    audioProbes.set(track.sid!, probe);
  }
});
room.on(RoomEvent.TrackUnsubscribed, track => {
  audioProbes.get(track.sid!)?.close();
  audioProbes.delete(track.sid!);
});
(window as any).livekitPeer = {
  connect: async (roomName: string) => {
    const response = await fetch(
      `http://127.0.0.1:5209/token?room=${encodeURIComponent(roomName)}&identity=browser-qa-peer`
    );
    await room.connect('ws://127.0.0.1:17880', (await response.json()).token);
    await room.localParticipant.publishTrack(
      canvas.captureStream(10).getVideoTracks()[0],
      { source: Track.Source.Camera }
    );
    await audio.resume();
    await room.localParticipant.publishTrack(
      destination.stream.getAudioTracks()[0].clone(),
      { source: Track.Source.Microphone }
    );
  },
  disconnect: () => room.disconnect(),
  snapshot: async () => {
    let packets = 0;
    let energy = 0;
    let samples = 0;
    let muted = false;
    const inbound: unknown[] = [];
    const publications: unknown[] = [];
    for (const participant of room.remoteParticipants.values())
      for (const publication of participant.audioTrackPublications.values()) {
        publications.push({
          muted: publication.isMuted,
          subscribed: publication.isSubscribed,
          track: publication.track?.mediaStreamTrack.readyState
        });
        muted = publication.isMuted;
        const stats = await publication.track?.getRTCStatsReport();
        stats?.forEach(stat => {
          if (stat.type === 'inbound-rtp') inbound.push(stat);
          if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
            packets += stat.packetsReceived || 0;
            energy += stat.totalAudioEnergy || 0;
            samples += stat.totalSamplesReceived || 0;
          }
        });
      }
    return {
      frames,
      subscriptions,
      states: [...states],
      state: room.state,
      peers: room.remoteParticipants.size,
      width: video.videoWidth,
      height: video.videoHeight,
      packets,
      energy,
      samples,
      muted,
      audioContext: audio.state,
      audioTime: audio.currentTime,
      decodedAudio: [...audioProbes.values()].map(probe => probe.snapshot()),
      publications,
      inbound
    };
  }
};
