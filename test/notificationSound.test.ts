import { afterAll, beforeEach, expect, mock, test } from 'bun:test';

let policy: () => Promise<boolean> = async () => true;
const nativeSound = mock(async () => false);
mock.module('../src/services/useNotificationSoundPolicy', () => ({
  shouldPlayNotificationSound: () => policy(),
  playNativeNotificationSound: nativeSound
}));

const originalAudio = globalThis.Audio;
const originalNow = Date.now;
let now = 10000;
const play = mock(async () => {});
let player: FakeAudio;
class FakeAudio {
  constructor() {
    player = this;
  }
  paused = true;
  ended = false;
  currentTime = 0;
  preload = '';
  play = play;
}
globalThis.Audio = FakeAudio as unknown as typeof Audio;
Date.now = () => now;
const { playMessageNotificationSound } = await import(
  '../src/services/notification-sound'
);

beforeEach(() => {
  now += 10000;
  play.mockClear();
  nativeSound.mockReset();
  nativeSound.mockResolvedValue(false);
  policy = async () => true;
  if (player) player.paused = true;
});
afterAll(() => {
  globalThis.Audio = originalAudio;
  Date.now = originalNow;
});

test('40 simultaneous forwards play one sound, including a delayed policy', async () => {
  let release!: (allowed: boolean) => void;
  policy = () =>
    new Promise(resolve => {
      release = resolve;
    });
  const burst = Array.from({ length: 40 }, () =>
    playMessageNotificationSound()
  );
  expect(nativeSound).not.toHaveBeenCalled();
  release(true);
  await Promise.all(burst);
  expect(play).toHaveBeenCalledTimes(1);
  expect(nativeSound).toHaveBeenCalledTimes(1);
  await playMessageNotificationSound();
  expect(play).toHaveBeenCalledTimes(1);
});

test('native sound is also limited to one per burst and allows a later message', async () => {
  nativeSound.mockResolvedValue(true);
  await Promise.all(
    Array.from({ length: 40 }, () => playMessageNotificationSound())
  );
  expect(nativeSound).toHaveBeenCalledTimes(1);
  expect(play).not.toHaveBeenCalled();
  now += 2000;
  await playMessageNotificationSound();
  expect(nativeSound).toHaveBeenCalledTimes(2);
});

test('muted notifications and rejected autoplay do not lock later sounds', async () => {
  policy = async () => false;
  await playMessageNotificationSound();
  expect(play).not.toHaveBeenCalled();
  policy = async () => true;
  play.mockRejectedValueOnce(new Error('autoplay blocked'));
  await playMessageNotificationSound();
  now += 2000;
  await playMessageNotificationSound();
  expect(play).toHaveBeenCalledTimes(2);
});

test('a playing audio is never layered with another even after the cooldown', async () => {
  await playMessageNotificationSound();
  player.paused = false;
  now += 2000;
  await playMessageNotificationSound();
  expect(play).toHaveBeenCalledTimes(1);
  player.paused = true;
  await playMessageNotificationSound();
  expect(play).toHaveBeenCalledTimes(2);
});
