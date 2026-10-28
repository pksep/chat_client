import { expect, mock, test } from 'bun:test';
import type { LocalVideoTrack, Room } from 'livekit-client';
import {
  createScreenShareOperation,
  disconnectForRoomReplacement,
  isScreenCapturePermissionDenied
} from '../src/services/call-screen-share-lifecycle';

test('room replacement retains the screen capture and releases camera/microphone', async () => {
  const screen = { mediaStreamTrack: { readyState: 'live' }, stop: mock() };
  const camera = { stop: mock() };
  const microphone = { stop: mock() };
  const disconnect = mock(async (stopTracks = true) => {
    if (stopTracks) screen.stop();
  });
  const room = {
    localParticipant: {
      trackPublications: new Map([
        ['screen', { track: screen }],
        ['camera', { track: camera }],
        ['microphone', { track: microphone }]
      ])
    },
    disconnect
  } as unknown as Room;
  await disconnectForRoomReplacement(
    room,
    screen as unknown as LocalVideoTrack
  );
  expect(screen.stop).not.toHaveBeenCalled();
  expect(camera.stop).toHaveBeenCalledTimes(1);
  expect(microphone.stop).toHaveBeenCalledTimes(1);
  expect(disconnect).toHaveBeenCalledWith(false);
});

test('without a live screen capture room replacement uses normal track cleanup', async () => {
  const disconnect = mock(async () => {});
  const room = { disconnect } as unknown as Room;
  await disconnectForRoomReplacement(room, null);
  expect(disconnect).toHaveBeenCalledWith();
});

test('rapid repeated clicks share one pending capture/publication and unlock after failure', async () => {
  const run = createScreenShareOperation();
  let reject!: (error: Error) => void;
  const operation = mock(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      })
  );
  const first = run(operation);
  const repeated = Array.from({ length: 6 }, () => run(operation));
  expect(operation).toHaveBeenCalledTimes(1);
  expect(repeated.every(promise => promise === first)).toBe(true);
  const settled = Promise.allSettled([first, ...repeated]);
  reject(
    new Error('publication of local track timed out, no response from server')
  );
  expect((await settled).every(result => result.status === 'rejected')).toBe(
    true
  );
  const retry = mock(async () => {});
  await run(retry);
  expect(retry).toHaveBeenCalledTimes(1);
});

test('SDK publication cancellation is not reported as a user permission refusal', () => {
  expect(
    isScreenCapturePermissionDenied(
      new Error('Cancelled publication by calling unpublish')
    )
  ).toBe(false);
  expect(
    isScreenCapturePermissionDenied(
      new DOMException('Permission denied', 'NotAllowedError')
    )
  ).toBe(true);
  expect(
    isScreenCapturePermissionDenied(new Error('publication timed out'))
  ).toBe(false);
});
