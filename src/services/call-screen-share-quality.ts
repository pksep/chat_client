import {
  ScreenSharePresets,
  VideoQuality,
  type RemoteTrackPublication,
  type TrackPublishOptions
} from 'livekit-client';

export const getScreenSharePublishDefaults = (
  desktop: boolean
): TrackPublishOptions =>
  desktop
    ? {
        degradationPreference: 'maintain-resolution',
        simulcast: false,
        screenShareEncoding: ScreenSharePresets.original.encoding,
        screenShareSimulcastLayers: undefined
      }
    : {
        degradationPreference: 'balanced',
        simulcast: true,
        screenShareEncoding: ScreenSharePresets.original.encoding,
        screenShareSimulcastLayers: [
          ScreenSharePresets.h360fps3,
          ScreenSharePresets.h720fps5
        ]
      };

export const getScreenSharePublishingQuality = (
  desktop: boolean,
  networkQuality: VideoQuality
) => (desktop ? VideoQuality.HIGH : networkQuality);

export const applyDesktopScreenShareSubscription = (
  publication: Pick<
    RemoteTrackPublication,
    'setEnabled' | 'setVideoFPS' | 'setVideoQuality'
  >,
  desktop: boolean,
  source: 'camera' | 'screen'
): boolean => {
  if (!desktop || source !== 'screen') return false;
  // У большого экрана и миниатюры один track: размер миниатюры не снижает чёткость.
  publication.setEnabled(true);
  publication.setVideoFPS(30);
  publication.setVideoQuality(VideoQuality.HIGH);
  return true;
};
