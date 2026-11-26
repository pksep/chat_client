import { expect, test } from 'bun:test';
import { waitForDesktopCallFullscreen } from '../src/services/desktop-call-fullscreen';

test('ожидает подтверждения WM после раннего ACK fullscreen', async () => {
  let reads = 0;
  await waitForDesktopCallFullscreen(
    {
      isFullscreen: async () => ++reads >= 3
    },
    true,
    () => true
  );
  expect(reads).toBe(3);
});

test('после закрытия не обращается к исчезнувшему окну', async () => {
  let current = true;
  let reads = 0;
  await waitForDesktopCallFullscreen(
    {
      isFullscreen: async () => {
        reads++;
        current = false;
        return true;
      }
    },
    false,
    () => current
  );
  expect(reads).toBe(1);
});
