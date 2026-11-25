import { describe, expect, test } from 'bun:test';
import {
  RemoteTrackPublication,
  RemoteVideoTrack,
  ScreenSharePresets,
  Track,
  TrackEvent,
  VideoQuality
} from 'livekit-client';
import { TrackInfo, TrackSource, TrackType } from '@livekit/protocol';
import {
  applyDesktopScreenShareSubscription,
  getScreenSharePublishDefaults,
  getScreenSharePublishingQuality
} from '../src/services/call-screen-share-quality';

const fixture = () => {
  const publication = new RemoteTrackPublication(
    Track.Kind.Video,
    new TrackInfo({
      sid: 'TR_SYNTHETIC_SCREEN',
      type: TrackType.VIDEO,
      source: TrackSource.SCREEN_SHARE,
      width: 1920,
      height: 1080
    }),
    true
  );
  publication.track = new RemoteVideoTrack(
    { id: 'synthetic', kind: 'video', readyState: 'live' } as MediaStreamTrack,
    'TR_SYNTHETIC_SCREEN',
    {} as RTCRtpReceiver,
    { pixelDensity: 'screen' }
  );
  const requests: { quality: number; width: number; height: number }[] = [];
  publication.on(TrackEvent.UpdateSettings, settings => {
    requests.push({
      quality: settings.quality,
      width: settings.width,
      height: settings.height
    });
  });
  return { publication, requests };
};

describe('Чёткость демонстрации Tauri', () => {
  test('публикация сохраняет исходное разрешение без низких simulcast-слоёв', () => {
    expect(getScreenSharePublishDefaults(true)).toEqual({
      degradationPreference: 'maintain-resolution',
      simulcast: false,
      screenShareEncoding: ScreenSharePresets.original.encoding,
      screenShareSimulcastLayers: undefined
    });
  });

  test('браузер и Android сохраняют прежнюю адаптивную публикацию', () => {
    expect(getScreenSharePublishDefaults(false)).toEqual({
      degradationPreference: 'balanced',
      simulcast: true,
      screenShareEncoding: ScreenSharePresets.original.encoding,
      screenShareSimulcastLayers: [
        ScreenSharePresets.h360fps3,
        ScreenSharePresets.h720fps5
      ]
    });
  });

  test('запросы большого изображения, миниатюры и focus/fullscreen не снижают track', () => {
    const { publication, requests } = fixture();
    for (let i = 0; i < 12; i++) {
      expect(
        applyDesktopScreenShareSubscription(publication, true, 'screen')
      ).toBe(true);
    }
    expect(requests.length).toBeGreaterThan(0);
    expect(
      requests.every(
        request =>
          request.quality === VideoQuality.HIGH &&
          !request.width &&
          !request.height
      )
    ).toBe(true);
    // SDK не шлёт повторяющиеся настройки на каждое событие интерфейса.
    expect(requests.length).toBeLessThanOrEqual(3);
  });

  test('возврат после старого запроса миниатюры заменяет размеры на HIGH', () => {
    const { publication, requests } = fixture();
    publication.setVideoDimensions({ width: 180, height: 102 });
    applyDesktopScreenShareSubscription(publication, true, 'screen');
    expect(requests.at(-1)).toEqual({
      quality: VideoQuality.HIGH,
      width: 0,
      height: 0
    });
  });

  test('камера и другие клиенты не получают фиксированную подписку', () => {
    const { publication, requests } = fixture();
    expect(
      applyDesktopScreenShareSubscription(publication, true, 'camera')
    ).toBe(false);
    expect(
      applyDesktopScreenShareSubscription(publication, false, 'screen')
    ).toBe(false);
    expect(requests).toEqual([]);
  });

  test('оценка сети камеры не выключает полное разрешение демо Tauri', () => {
    for (const quality of [
      VideoQuality.LOW,
      VideoQuality.MEDIUM,
      VideoQuality.HIGH
    ]) {
      expect(getScreenSharePublishingQuality(true, quality)).toBe(
        VideoQuality.HIGH
      );
      expect(getScreenSharePublishingQuality(false, quality)).toBe(quality);
    }
  });
});
