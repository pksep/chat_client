import { describe, expect, mock, test } from 'bun:test';
import { createGroupCallInviteQueue } from '../src/services/groupCallInviteQueue';

describe('group call invite launch queue', () => {
  test('waits for readiness and consumes a duplicated cold-start invite once', async () => {
    const queue = createGroupCallInviteQueue();
    const consume = mock(async (_url: string) => true);
    let ready = false;
    const invite = {
      key: 'room\u0000signed-invite',
      url: 'https://chat.pksep.ru/?callRoom=room&callInvite=signed-invite'
    };

    expect(queue.enqueue(invite)).toBe(true);
    expect(queue.enqueue(invite)).toBe(false);
    expect(await queue.flush(() => ready, consume)).toBe(false);
    expect(consume).toHaveBeenCalledTimes(0);

    ready = true;
    const [firstFlush, duplicateFlush] = await Promise.all([
      queue.flush(() => ready, consume),
      queue.flush(() => ready, consume)
    ]);

    expect(firstFlush).toBe(true);
    expect(duplicateFlush).toBe(true);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(queue.enqueue(invite)).toBe(false);
    expect(await queue.flush(() => ready, consume)).toBe(false);
    expect(consume).toHaveBeenCalledTimes(1);
  });

  test('keeps the latest link received before readiness', async () => {
    const queue = createGroupCallInviteQueue();
    const consumedUrls: string[] = [];

    queue.enqueue({ key: 'first', url: 'https://chat.pksep.ru/?first' });
    queue.enqueue({ key: 'second', url: 'https://chat.pksep.ru/?second' });

    await queue.flush(
      () => true,
      async url => {
        consumedUrls.push(url);
        return true;
      }
    );

    expect(consumedUrls).toEqual(['https://chat.pksep.ru/?second']);
  });

  test('allows a later deliberate tap on the same invite', async () => {
    let currentTime = 1_000;
    const queue = createGroupCallInviteQueue({
      duplicateWindowMs: 5_000,
      now: () => currentTime
    });
    const invite = {
      key: 'room\u0000signed-invite',
      url: 'https://chat.pksep.ru/?callRoom=room&callInvite=signed-invite'
    };
    const consume = mock(async (_url: string) => true);

    queue.enqueue(invite);
    await queue.flush(() => true, consume);
    currentTime += 4_999;
    expect(queue.enqueue(invite)).toBe(false);

    currentTime += 1;
    expect(queue.enqueue(invite)).toBe(true);
    await queue.flush(() => true, consume);
    expect(consume).toHaveBeenCalledTimes(2);
  });
});
