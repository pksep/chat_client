import { expect, test } from '@playwright/test';
import { makeMessages, openFixture } from './fixtures/topic-performance-page';

test('оба офлайн-кеша сохраняют ID и сердечко после перезапуска, независимо от порядка копий', async ({
  page
}) => {
  const { errors } = await openFixture(page);
  const base = {
    ...makeMessages('cache', 1)[0],
    senderUserId: 'performance-user',
    updatedAt: '2026-10-19T10:13:44.560Z',
    ex: JSON.stringify({ clientId: 'client-id' })
  };
  const first = {
    ...base,
    id: 'copy-a',
    createdAt: '2026-10-19T10:13:40.316Z'
  };
  const second = {
    ...base,
    id: 'copy-b',
    createdAt: '2026-10-19T10:13:40.318Z',
    reactions: [
      { id: 'heart', messageId: 'copy-b', senderUserId: 'peer', text: '❤️' }
    ]
  };
  const pending = {
    ...base,
    id: 'client-id',
    status: 'WAIT',
    createdAt: '2026-10-19T10:13:42Z'
  };
  const cases = [
    [first, second],
    [second, first],
    [pending, second],
    [second, pending],
    [
      { ...first, ex: { clientId: 'client-id' } },
      { ...second, ex: { clientId: 'client-id' } }
    ]
  ];
  await page.evaluate(async cases => {
    const path = '/src/services/useTopicMessagesCache.ts';
    const cache = await import(/* @vite-ignore */ path);
    const shadow = (window as any).topicPerformance.shadow;
    for (let index = 0; index < cases.length; index++) {
      const topicId = `identity-cache-${index}`;
      const rows = cases[index].map(message => ({ ...message, topicId }));
      await cache.saveCachedTopicMessages(topicId, rows, 'performance-user');
      await shadow.saveShadowTopicSnapshot(
        topicId,
        rows,
        'http',
        'performance-user',
        { replace: true }
      );
    }
  }, cases);
  await page.reload();
  const results = await page.evaluate(async count => {
    const cachePath = '/src/services/useTopicMessagesCache.ts';
    const shadowPath = '/src/services/useShadowChatSync.ts';
    const cache = await import(/* @vite-ignore */ cachePath);
    const shadow = await import(/* @vite-ignore */ shadowPath);
    const results = [];
    for (let index = 0; index < count; index++) {
      const topicId = `identity-cache-${index}`;
      for (const load of [
        cache.loadCachedTopicMessages,
        shadow.loadShadowTopicSnapshot
      ]) {
        const rows = await load(topicId, 'performance-user');
        results.push(
          rows.map((message: any) => ({
            id: message.id,
            status: message.status,
            reactions: (message.reactions || []).map(
              (reaction: any) => reaction.messageId
            )
          }))
        );
      }
    }
    return results;
  }, cases.length);
  const expected = [
    { id: 'copy-a', status: 'READ', reactions: [] },
    { id: 'copy-b', status: 'READ', reactions: ['copy-b'] }
  ];
  for (const [index, rows] of results.entries()) {
    expect(rows, `кейс ${Math.floor(index / 2)}, кеш ${index % 2}`).toEqual(
      [2, 3].includes(Math.floor(index / 2)) ? [expected[1]] : expected
    );
  }
  expect(errors).toEqual([]);
});
