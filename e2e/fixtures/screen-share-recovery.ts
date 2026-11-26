import {
  ConnectionQuality,
  ConnectionState,
  RemoteTrackPublication,
  RemoteVideoTrack,
  Room,
  RoomEvent,
  Track,
  TrackEvent,
  VideoQuality,
  type TrackPublishOptions
} from 'livekit-client';
import { TrackInfo, TrackSource, TrackType } from '@livekit/protocol';
import { authedUser } from '../../src/composables/useAuth';
import { setConfig } from '../../src/services/useConfig';
import { initializeChat, getChatSDK } from '../../src/services/useChat';
import { ChatSDK } from '../../src/services/useChatSDK';
import * as calls from '../../src/services/useLiveKit';
import { state } from '../../src/services/useCallState';

// Только транспорт подменён: жизненный цикл звонка и MediaStreamTrack настоящие.
export async function initializeScreenShareRecoveryFixture() {
  const rooms: Room[] = [];
  const publishOptions: TrackPublishOptions[] = [];
  const publishingQualities: VideoQuality[] = [];
  const remoteRequests: {
    quality: VideoQuality;
    width: number;
    height: number;
  }[] = [];
  let captureCount = 0;
  let publishCount = 0;
  let releaseCapture: (() => void) | null = null;
  let releasePublication: (() => void) | null = null;
  let delayCapture = false;
  let delayPublication = false;
  let failPublication = false;
  const captured: MediaStreamTrack[] = [];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  canvas.getContext('2d')!.fillRect(0, 0, 64, 64);
  navigator.mediaDevices.getDisplayMedia = async () => {
    captureCount++;
    if (delayCapture)
      await new Promise<void>(resolve => {
        releaseCapture = resolve;
      });
    const stream = canvas.captureStream(5);
    captured.push(...stream.getTracks());
    return stream;
  };

  const configureRoom = (room: Room) => {
    room.connect = async function () {
      rooms.push(this);
      this.state = ConnectionState.Connected;
      const participant = this.localParticipant;
      participant.setMicrophoneEnabled = async () => undefined;
      participant.publishTrack = async (track, options) => {
        publishCount++;
        publishOptions.push(options || {});
        if (delayPublication)
          await new Promise<void>(resolve => {
            releasePublication = resolve;
          });
        if (failPublication) {
          failPublication = false;
          throw new Error(
            'publication of local track timed out, no response from server'
          );
        }
        const publication = {
          track,
          videoTrack: {
            setPublishingQuality: (quality: VideoQuality) =>
              publishingQualities.push(quality)
          },
          source: Track.Source.ScreenShare,
          isMuted: false,
          trackSid: `screen-${publishCount}`
        } as any;
        participant.trackPublications.set(publication.trackSid, publication);
        participant.videoTrackPublications.set(
          publication.trackSid,
          publication
        );
        this.emit(RoomEvent.LocalTrackPublished, publication);
        return publication;
      };
      participant.setScreenShareEnabled = async () => {
        participant.videoTrackPublications.forEach(publication =>
          publication.track?.stop()
        );
        participant.trackPublications.clear();
        participant.videoTrackPublications.clear();
        return undefined;
      };
    };
    room.disconnect = async function (stopTracks = true) {
      this.localParticipant.trackPublications.forEach(publication => {
        if (stopTracks) publication.track?.stop();
      });
      this.localParticipant.trackPublications.clear();
      this.localParticipant.videoTrackPublications.clear();
      this.state = ConnectionState.Disconnected;
      this.emit(RoomEvent.Disconnected);
    };
    room.startAudio = async () => {};
    return room;
  };
  (window as any).__createScreenTestRoom = (options: any) =>
    configureRoom(new Room(options));

  authedUser.value = { id: 'screen-share-test', name: 'Тест' } as any;
  setConfig({
    CHAT_API_DOMAIN: `${location.origin}/screen-share-api`,
    CHAT_LIVEKIT_URL: 'ws://127.0.0.1:65530'
  });
  ChatSDK.prototype.connect = () => new Promise<void>(() => {});
  await initializeChat({
    userId: authedUser.value.id,
    token: 'isolated-screen-share-test',
    apiUrl: `${location.origin}/screen-share-api`,
    wsUrl: 'ws://127.0.0.1:65530'
  });
  const sdk = getChatSDK()!;
  sdk.getLiveKitToken = async () => 'isolated-token';
  sdk.sendWebSocketEventWithAck = async (_type, payload: any) =>
    ({
      accepted: true,
      roomId: payload.roomId,
      startTime: Date.now()
    }) as any;
  sdk.getLiveKitCallStatus = async () => ({ active: true }) as any;
  await calls.startStandaloneMeetingCall();

  return {
    calls,
    snapshot: () => ({
      captureCount,
      publishCount,
      publishOptions,
      publishingQualities,
      remoteRequests,
      roomCount: rooms.length,
      screenActive: state.isScreenSharingActive,
      tracks: captured.map(track => ({
        id: track.id,
        contentHint: track.contentHint,
        readyState: track.readyState
      }))
    }),
    desktopMode: () => {
      (window as any).isTauri = true;
      localStorage.setItem(
        'chat.desktop.permissions.v1',
        JSON.stringify({ 'screen-capture': 'granted' })
      );
    },
    simulateQuality: (quality: ConnectionQuality) => {
      const room = rooms.at(-1)!;
      Object.defineProperty(room.localParticipant, 'connectionQuality', {
        configurable: true,
        value: quality
      });
      room.emit(
        RoomEvent.ConnectionQualityChanged,
        quality,
        room.localParticipant
      );
    },
    attachRemoteScreen: () => {
      const media = canvas.captureStream(5).getVideoTracks()[0];
      captured.push(media);
      const publication = new RemoteTrackPublication(
        Track.Kind.Video,
        new TrackInfo({
          sid: 'TR_SCREEN_SYNTHETIC',
          type: TrackType.VIDEO,
          source: TrackSource.SCREEN_SHARE,
          width: 1920,
          height: 1080
        }),
        true
      );
      publication.track = new RemoteVideoTrack(
        media,
        publication.trackSid,
        {} as RTCRtpReceiver,
        { pixelDensity: 'screen' }
      );
      publication.on(TrackEvent.UpdateSettings, settings =>
        remoteRequests.push({
          quality: settings.quality,
          width: settings.width,
          height: settings.height
        })
      );
      rooms.at(-1)!.remoteParticipants.set('screen-source', {
        identity: 'screen-source',
        name: 'Синтетическая демонстрация',
        videoTrackPublications: new Map([[publication.trackSid, publication]]),
        trackPublications: new Map([[publication.trackSid, publication]]),
        audioTrackPublications: new Map(),
        connectionQuality: ConnectionQuality.Excellent
      } as any);
      return new MediaStream([media]);
    },
    setDelayCapture: () => {
      delayCapture = true;
    },
    releaseCapture: () => releaseCapture?.(),
    setDelayPublication: () => {
      delayPublication = true;
    },
    releasePublication: () => {
      delayPublication = false;
      releasePublication?.();
    },
    failNextPublication: () => {
      failPublication = true;
    },
    signalReconnect: () => {
      const room = rooms.at(-1)!;
      room.emit(RoomEvent.SignalReconnecting);
      room.emit(RoomEvent.Reconnected);
    },
    setReconnecting: () => {
      rooms.at(-1)!.state = ConnectionState.Reconnecting;
    },
    simulateHighRtt: () => {
      (rooms.at(-1)!.engine as any).pcManager = {
        publisher: {
          getStats: async () =>
            new Map([
              [
                'transport',
                {
                  id: 'transport',
                  type: 'transport',
                  selectedCandidatePairId: 'pair'
                }
              ],
              [
                'pair',
                {
                  id: 'pair',
                  type: 'candidate-pair',
                  state: 'succeeded',
                  currentRoundTripTime: 0.95,
                  localCandidateId: 'local',
                  remoteCandidateId: 'remote'
                }
              ],
              [
                'local',
                { id: 'local', type: 'local-candidate', candidateType: 'host' }
              ],
              [
                'remote',
                {
                  id: 'remote',
                  type: 'remote-candidate',
                  candidateType: 'host'
                }
              ]
            ])
        }
      };
    },
    replaceRoom: async () => {
      // Эмулируем потерю транспорта, чтобы штатное восстановление заменило Room.
      rooms.at(-1)!.state = ConnectionState.Disconnected;
      await calls.recoverActiveCallAfterNetworkChange('test-network-change');
    }
  };
}
