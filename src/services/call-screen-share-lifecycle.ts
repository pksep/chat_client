import type { LocalVideoTrack, Room } from 'livekit-client';

// При замене Room сохраняем только захват экрана; микрофон и камеру освобождаем.
export const disconnectForRoomReplacement = (
  room: Room,
  screenTrack: LocalVideoTrack | null
): Promise<void> => {
  if (!screenTrack || screenTrack.mediaStreamTrack.readyState !== 'live') {
    return room.disconnect();
  }

  room.localParticipant.trackPublications.forEach(publication => {
    if (publication.track && publication.track !== screenTrack) {
      publication.track.stop();
    }
  });
  return room.disconnect(false);
};

export const isScreenCapturePermissionDenied = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const name = 'name' in error ? error.name : null;
  return name === 'NotAllowedError' || name === 'PermissionDeniedError';
};

export const createScreenShareOperation = () => {
  let pending: Promise<void> | null = null;
  return (operation: () => Promise<void>): Promise<void> => {
    if (pending) return pending;
    // Не откладываем getDisplayMedia: ему нужен жест пользователя.
    const task = operation();
    pending = task.finally(() => {
      if (pending === result) pending = null;
    });
    const result = pending;
    return result;
  };
};
