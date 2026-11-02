import { expect, test } from '@playwright/test';
import {
  makeMessages,
  message,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

test.beforeEach(async ({ page }) => {
  await page.addLocatorHandler(
    page.locator('dialog.ios-push-modal[open]'),
    dialog =>
      dialog
        .getByRole('button', { name: 'Настроить позже', exact: true })
        .click()
  );
});

test('IndexedDB дополняет два новых сообщения из памяти до ответа HTTP', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true, unreadCount: 2 });
  const rows = makeMessages('performance-0', 82).map((row, index) => ({
    ...row,
    isReadByMe: index < 80
  }));
  await page.evaluate(async rows => {
    const fixture = (window as any).topicPerformance;
    await fixture.shadow.saveShadowTopicSnapshot(
      'performance-0',
      rows.slice(0, 80),
      'local',
      'performance-user',
      { replace: true }
    );
    fixture.seed('performance-0', rows.slice(-2));
    fixture.setTopics([
      { ...fixture.getSelectedTopic('performance-0'), lastMessage: rows.at(-1) }
    ]);
  }, rows);
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  let completed = false;
  await page.route('**/messages/topic/performance-0?*', async route => {
    await gate;
    await route.fulfill({ json: rows });
    completed = true;
  });
  try {
    await openTopic(page, 0);
    await expect(message(page, 0, 81)).toBeInViewport();
    await expect(message(page, 0, 79)).toBeInViewport();
    expect(completed).toBe(false);
    release();
    await expect(
      page.locator('.chat__message-unread_messages_start')
    ).toBeInViewport();
    await expect(message(page, 0, 79)).toBeInViewport();
  } finally {
    release();
  }
  expect(state.errors).toEqual([]);
});

for (const cachedCount of [2, 20]) {
  test(`неполный кеш непрочитанных восстанавливает контекст после ошибки HTTP: ${cachedCount}`, async ({
    page
  }) => {
    const state = await openFixture(page, { shell: true, unreadCount: 2 });
    const rows = makeMessages('performance-0', 82).map((row, index) => ({
      ...row,
      isReadByMe: index < 80
    }));
    await page.evaluate(
      ({ rows, cachedCount }) => {
        const fixture = (window as any).topicPerformance;
        fixture.seed('performance-0', rows.slice(-cachedCount));
        fixture.setTopics([
          {
            ...fixture.getSelectedTopic('performance-0'),
            lastMessage: rows.at(-1)
          }
        ]);
      },
      { rows, cachedCount }
    );
    let requests = 0;
    await page.route('**/messages/topic/performance-0?*', route => {
      if (++requests === 1)
        return route.fulfill({ status: 503, json: { message: 'Недоступно' } });
      const limit = Number(
        new URL(route.request().url()).searchParams.get('limit')
      );
      return route.fulfill({
        json: rows
          .slice(-limit)
          .map(row => ({ ...row, text: `${row.text} обновлено` }))
      });
    });
    await openTopic(page, 0);
    await expect(message(page, 0, 81)).toBeVisible();
    await expect(message(page, 0, 79)).toBeInViewport();
    await expect(message(page, 0, 79)).toContainText('обновлено');
    await expect(message(page, 0, 80)).toBeInViewport();
    await expect(
      page.locator('.chat__message-unread_messages_start')
    ).toBeInViewport();
    expect(requests).toBeGreaterThan(1);
    expect(state.errors).toEqual([]);
  });
}

for (const cacheSource of ['без кеша', 'память', 'IndexedDB']) {
  test(`контекст перед двумя непрочитанными виден после входа: ${cacheSource}`, async ({
    page
  }) => {
    const state = await openFixture(page, { shell: true, unreadCount: 2 });
    const rows = makeMessages('performance-0', 82).map((row, index) => ({
      ...row,
      isReadByMe: index < 80
    }));
    await page.evaluate(
      async ({ rows, cacheSource }) => {
        const fixture = (window as any).topicPerformance;
        fixture.setTopics([
          {
            ...fixture.getSelectedTopic('performance-0'),
            lastMessage: rows.at(-1)
          }
        ]);
        if (cacheSource === 'память')
          fixture.seed('performance-0', rows.slice(-2));
        if (cacheSource === 'IndexedDB')
          await fixture.shadow.saveShadowTopicSnapshot(
            'performance-0',
            rows.slice(-2),
            'local',
            'performance-user',
            { replace: true }
          );
      },
      { rows, cacheSource }
    );
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    await page.route('**/messages/topic/performance-0?*', async route => {
      await gate;
      const params = new URL(route.request().url()).searchParams;
      const before = params.get('lastMessageId');
      const after = params.get('afterMessageId');
      const limit = Number(params.get('limit') || 80);
      await route.fulfill({
        json: before
          ? rows
              .slice(
                0,
                rows.findIndex(row => row.id === before)
              )
              .slice(-limit)
          : after
            ? rows.slice(
                rows.findIndex(row => row.id === after) + 1,
                rows.findIndex(row => row.id === after) + 1 + limit
              )
            : rows.slice(-limit)
      });
    });
    try {
      await openTopic(page, 0);
      if (cacheSource !== 'без кеша')
        await expect(message(page, 0, 81)).toBeVisible();
      release();
      await expect(message(page, 0, 80)).toBeInViewport();
      await expect(message(page, 0, 79)).toBeInViewport();
      await expect(
        page.locator('.chat__message-unread_messages_start')
      ).toBeInViewport();
      expect(state.errors).toEqual([]);
    } finally {
      release();
    }
  });
}

test('свежая пустая история заменяет кеш и старое последнее сообщение', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true });
  await page.evaluate(
    rows => {
      const fixture = (window as any).topicPerformance;
      fixture.seed('performance-0', rows);
      fixture.setTopics([
        {
          ...fixture.getSelectedTopic('performance-0'),
          lastMessage: rows.at(-1)
        }
      ]);
    },
    makeMessages('performance-0', 20)
  );
  await page.route('**/messages/topic/performance-0?*', route =>
    route.fulfill({ json: [] })
  );
  await openTopic(page, 0);
  await expect(
    page.locator('[data-testid$="-MessageList-EmptyChat"]')
  ).toBeVisible();
  await expect(page.locator('[data-message-id]')).toHaveCount(0);
  await expect(
    page.locator('[data-testid$="-MessageList-Skeleton"]')
  ).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

for (const cacheSource of ['память', 'IndexedDB']) {
  test(`онлайн: сохранённый кеш виден до HTTP, свежая история открывается у непрочитанных: ${cacheSource}`, async ({
    page
  }) => {
    const state = await openFixture(page, { shell: true, unreadCount: 60 });
    const rows = makeMessages('performance-0', 140).map((row, index) => ({
      ...row,
      isReadByMe: index < 80
    }));
    await page.evaluate(
      async ({ rows, cacheSource, lastMessage }) => {
        const fixture = (window as any).topicPerformance;
        fixture.setTopics([
          { ...fixture.getSelectedTopic('performance-0'), lastMessage }
        ]);
        if (cacheSource === 'память') fixture.seed('performance-0', rows);
        else
          await fixture.shadow.saveShadowTopicSnapshot(
            'performance-0',
            rows,
            'local',
            'performance-user',
            { replace: true }
          );
      },
      {
        rows: makeMessages('performance-0', 20),
        cacheSource,
        lastMessage: rows.at(-1)
      }
    );
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    await page.route('**/messages/topic/performance-0?*', async route => {
      await gate;
      const params = new URL(route.request().url()).searchParams;
      await route.fulfill({
        json:
          params.get('newMessages') === 'true'
            ? rows.slice(-50)
            : rows.slice(60)
      });
    });
    try {
      await openTopic(page, 0);
      await expect(message(page, 0, 19)).toBeVisible();
      await expect(
        page.locator('[data-testid$="-MessageList-Skeleton"]')
      ).toHaveCount(0);
      await page.evaluate(() => {
        (window as any).historyEntryFrames = [];
        const capture = () => {
          const first = document.querySelector(
            '[data-message-id="performance-0-message-80"]'
          );
          if (first && getComputedStyle(first).visibility !== 'hidden') {
            const divider = document.querySelector(
              '.chat__message-unread_messages_start'
            );
            const wrapper = document.querySelector('.chat__message-wrapper');
            const y =
              divider && wrapper
                ? divider.getBoundingClientRect().top -
                  wrapper.getBoundingClientRect().top
                : null;
            (window as any).historyEntryFrames.push(y);
          }
          if ((window as any).historyEntryFrames.length < 3)
            requestAnimationFrame(capture);
        };
        requestAnimationFrame(capture);
      });
      release();
      const divider = page.locator('.chat__message-unread_messages_start');
      await expect(divider).toBeInViewport();
      await expect(message(page, 0, 80)).toBeInViewport();
      await expect(message(page, 0, 19)).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(() => (window as any).historyEntryFrames.length)
        )
        .toBe(3);
      const positions = await page.evaluate(
        () => (window as any).historyEntryFrames as (number | null)[]
      );
      for (const y of positions) {
        expect(y).not.toBeNull();
        expect(Math.abs(y! - 8)).toBeLessThan(3);
      }
      await page
        .getByRole('button', {
          name: 'Перейти к новым сообщениям',
          exact: true
        })
        .click();
      await expect(message(page, 0, 139)).toBeInViewport();
      await expect(divider).toHaveCount(0);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(divider).toHaveCount(0);
    } finally {
      release();
    }
    expect(state.errors).toEqual([]);
  });
}

test('ошибка истории не скрывает отправку и входящие, восстановление не требует смены чата', async ({
  page
}, testInfo) => {
  const state = await openFixture(page, { shell: true });
  await page.evaluate(
    async ({ rows, lastMessage }) => {
      const fixture = (window as any).topicPerformance;
      await fixture.shadow.saveShadowTopicSnapshot(
        'performance-0',
        rows,
        'local',
        'performance-user',
        { replace: true }
      );
      fixture.setTopics([
        { ...fixture.getSelectedTopic('performance-0'), lastMessage }
      ]);
    },
    {
      rows: makeMessages('performance-0', 20),
      lastMessage: makeMessages('performance-0', 21).at(-1)
    }
  );
  await page.evaluate(async () => {
    const path = '/e2e/fixtures/network-harness.ts';
    (await import(/* @vite-ignore */ path)).controlConnection();
    (window as any).sent = [];
    (window as any).topicPerformance.sdk.sendWebSocketEvent = (
      type: string,
      payload: any
    ) => {
      if (type === 'sendMessage') (window as any).sent.push(payload);
      return true;
    };
  });
  let requests = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  let fresh = makeMessages('performance-0', 21).slice(-1);
  await page.route('**/messages/topic/performance-0?*', async route => {
    if (++requests === 1)
      return route.fulfill({ status: 503, json: { message: 'Недоступно' } });
    await gate;
    return route.fulfill({ json: fresh });
  });
  try {
    await openTopic(page, 0);
    await expect.poll(() => requests).toBeGreaterThan(0);
    await expect(message(page, 0, 19)).toBeVisible();
    await expect(page.getByText(/^Не удалось обновить сообщения/)).toHaveCount(
      0
    );
    await expect(
      page.getByRole('button', { name: 'Повторить', exact: true })
    ).toHaveCount(0);
    const editor = page.locator('.chat__input .ProseMirror');
    await editor.fill('Сообщение после ошибки истории');
    await page.locator('.chat__input .toolbar-button.right:visible').click();
    await expect(page.locator('[data-is-me-sender="true"]')).toContainText(
      'Сообщение после ошибки истории'
    );
    const live = await page.evaluate(() => {
      const fixture = (window as any).topicPerformance;
      const pending = fixture.messages
        .getFullMessagesByTopicId('performance-0')
        .find((row: any) =>
          row.ex?.includes(JSON.parse((window as any).sent[0].ex).clientId)
        );
      const confirmed = {
        ...pending,
        id: 'confirmed-during-history-error',
        status: 'DELIVERED'
      };
      const incoming = {
        ...confirmed,
        id: 'incoming-during-history-error',
        ex: null,
        senderUserId: 'peer-0',
        text: 'Ответ во время восстановления',
        senderUser: { id: 'peer-0', name: 'Собеседник' }
      };
      for (const row of [confirmed, incoming])
        fixture.emitChatEvent({
          type: 'changeMessage',
          payload: { type: 'NEW', topicId: 'performance-0', data: row }
        });
      return [confirmed, incoming];
    });
    await expect(
      page.locator('[data-message-id="confirmed-during-history-error"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-message-id="incoming-during-history-error"]')
    ).toBeVisible();
    await expect(message(page, 0, 19)).toBeAttached();
    await editor.fill('Черновик во время восстановления');
    await page.evaluate(async () => {
      const path = '/src/services/useNotificationNavigation.ts';
      (
        await import(/* @vite-ignore */ path)
      ).notificationTopicRefreshRequest.value = {
        id: 100,
        topicId: 'performance-1',
        scrollToBottom: true
      };
    });
    await expect.poll(() => requests).toBeGreaterThan(1);
    fresh = [...fresh, ...live];
    release();
    await expect(message(page, 0, 20)).toBeVisible();
    await expect(editor).toHaveText('Черновик во время восстановления');
    await expect(page.locator('[data-message-id]')).toHaveCount(3);
    await expect(message(page, 0, 19)).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath('history-recovered.png')
    });
  } finally {
    release();
  }
  expect(state.errors).toEqual([]);
});

test('восстановление истории прекращается при уходе из чата', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true });
  let requests = 0;
  await page.route('**/messages/topic/performance-0?*', route => {
    requests++;
    return route.fulfill({ status: 503, json: {} });
  });
  await openTopic(page, 0);
  await expect.poll(() => requests).toBeGreaterThan(0);
  await openTopic(page, 1);
  await expect(message(page, 1)).toBeVisible();
  const before = requests;
  await page.waitForTimeout(2100);
  expect(requests).toBe(before);
  await expect(message(page, 0)).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test('восстановление истории ждёт сеть и сохраняет черновик', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true });
  let requests = 0;
  await page.route('**/messages/topic/performance-0?*', route => {
    requests++;
    return requests === 1
      ? route.fulfill({ status: 503, json: {} })
      : route.fulfill({ json: makeMessages('performance-0', 20) });
  });
  await openTopic(page, 0);
  await expect.poll(() => requests).toBe(1);
  const editor = page.locator('.chat__input .ProseMirror');
  await editor.fill('Черновик без сети');
  await page.context().setOffline(true);
  await page.waitForTimeout(2100);
  expect(requests).toBe(1);
  await page.context().setOffline(false);
  await expect(message(page, 0)).toBeVisible();
  await expect(editor).toHaveText('Черновик без сети');
  expect(state.errors).toEqual([]);
});
