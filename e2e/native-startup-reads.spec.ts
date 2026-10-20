import { expect, test } from '@playwright/test';

for (const scenario of [
  'other-topic',
  'same-topic',
  'unread-summary',
  'empty-unread-summary',
  'delta',
  'ordering-change'
] as const) {
  test(`прочтение не отменяет незатронутые Android-страницы: ${scenario}`, async ({
    page
  }) => {
    await page.route('**/__native-reads', route =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html>' })
    );
    await page.goto('/__native-reads');
    const result = await page.evaluate(async scenario => {
      let httpReads = 0;
      (window as any).androidBridge = {};
      (window as any).Capacitor = {
        PluginHeaders: [
          {
            name: 'ChatBackgroundSync',
            methods: [{ name: 'takeStartupRead', rtype: 'promise' }]
          }
        ],
        nativePromise: async () => ({ available: false })
      };
      const endpoint =
        scenario === 'delta'
          ? '/topics/sync?version=1&pts=42'
          : '/topics?page=2&limit=50';
      const data = {
        data: [
          { id: scenario === 'same-topic' ? 'changed-topic' : 'other-topic' }
        ],
        ...(scenario === 'unread-summary'
          ? { unreadTopics: [{ id: 'changed-topic' }] }
          : scenario === 'empty-unread-summary'
            ? { unreadTopics: [] }
            : {})
      };
      window.__chatNativePreparedReads = {
        token: 'fixture-token',
        result: Promise.resolve({
          available: true,
          apiUrl: 'https://api.test',
          startedAt: Date.now() - 500,
          reads: { [endpoint]: data }
        })
      };
      const { readJson, configureJsonReads, recordNativeStartupTopicEvent } =
        await import('/e2e/fixtures/native-startup-reads-harness.ts');
      const reqi = {
        sendRequest: async () => {},
        get: async () => {
          httpReads++;
          return Response.json({ data: [{ id: 'http-fresh' }] });
        }
      } as any;
      configureJsonReads(reqi, () => 'fixture-token', 'https://api.test');
      recordNativeStartupTopicEvent(
        scenario === 'ordering-change' ? undefined : 'changed-topic'
      );
      const value = await readJson(reqi, endpoint);
      return { value, data, httpReads };
    }, scenario);
    expect(result.httpReads).toBe(scenario === 'other-topic' ? 0 : 1);
    expect(result.value).toEqual(
      scenario === 'other-topic'
        ? result.data
        : { data: [{ id: 'http-fresh' }] }
    );
  });
}

for (const scenario of [
  'prepared',
  'token',
  'server',
  'expired',
  'topic-event'
] as const) {
  test(`ранняя передача Android-ответов проверяет сессию и свежесть: ${scenario}`, async ({
    page
  }) => {
    await page.route('**/__native-reads', route =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html>' })
    );
    await page.goto('/__native-reads');
    const result = await page.evaluate(async scenario => {
      let nativeReads = 0;
      let httpReads = 0;
      (window as any).androidBridge = {};
      (window as any).Capacitor = {
        PluginHeaders: [
          {
            name: 'ChatBackgroundSync',
            methods: [{ name: 'takeStartupRead', rtype: 'promise' }]
          }
        ],
        nativePromise: async () => {
          nativeReads++;
          return { available: false };
        }
      };
      const endpoint = '/topics?page=1&limit=50';
      const startedAt = Date.now() - (scenario === 'expired' ? 11_000 : 100);
      window.__chatNativePreparedReads = {
        token: scenario === 'token' ? 'old-token' : 'fixture-token',
        result: Promise.resolve({
          available: true,
          apiUrl:
            scenario === 'server' ? 'https://old-api.test' : 'https://api.test',
          startedAt,
          reads: { [endpoint]: { data: [{ id: 'early-native' }] } }
        })
      };
      const { readJson, configureJsonReads, recordNativeStartupTopicEvent } =
        await import('/e2e/fixtures/native-startup-reads-harness.ts');
      const reqi = {
        sendRequest: async () => {},
        get: async () => {
          httpReads++;
          return Response.json({ data: [{ id: 'http-fresh' }] });
        }
      } as any;
      configureJsonReads(reqi, () => 'fixture-token', 'https://api.test/');
      if (scenario === 'topic-event') recordNativeStartupTopicEvent();
      const first = await readJson(reqi, endpoint);
      const second = await readJson(reqi, endpoint);
      return { first, second, nativeReads, httpReads };
    }, scenario);
    expect(result.first).toEqual({
      data: [{ id: scenario === 'prepared' ? 'early-native' : 'http-fresh' }]
    });
    expect(result.second).toEqual({ data: [{ id: 'http-fresh' }] });
    expect(result.nativeReads).toBe(
      ['prepared', 'topic-event'].includes(scenario) ? 0 : 1
    );
    expect(result.httpReads).toBe(scenario === 'prepared' ? 1 : 2);
  });
}

for (const scenario of [
  'prepared',
  'unavailable',
  'stalled',
  'topic-event'
] as const) {
  test(`ранние Android-запросы сохраняют свежесть и общий таймаут: ${scenario}`, async ({
    page
  }) => {
    await page.route('**/__native-reads', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><div id="app"></div>'
      })
    );
    await page.goto('/__native-reads');
    const result = await page.evaluate(async scenario => {
      let nativeReads = 0;
      let httpReads = 0;
      let plan: any = null;
      const nativeStartedAt = Date.now() - 500;
      (window as any).androidBridge = {};
      (window as any).Capacitor = {
        PluginHeaders: [
          {
            name: 'ChatBackgroundSync',
            methods: [
              { name: 'takeStartupRead', rtype: 'promise' },
              { name: 'saveStartupReadPlan', rtype: 'promise' }
            ]
          }
        ],
        nativePromise: async (
          _plugin: string,
          method: string,
          options: any
        ) => {
          if (method === 'saveStartupReadPlan') {
            plan = options;
            return;
          }
          nativeReads++;
          if (scenario === 'stalled') await new Promise(() => {});
          return {
            available: scenario !== 'unavailable',
            startedAt: nativeStartedAt,
            data: { data: [{ id: 'native-fresh' }] }
          };
        }
      };
      const {
        readJson,
        configureJsonReads,
        finishNativeStartupReads,
        rememberNativeTopicSync,
        nativeStartupReadStartedAt,
        recordNativeStartupTopicEvent
      } = await import('/e2e/fixtures/native-startup-reads-harness.ts');
      const reqi = {
        sendRequest: async () => {},
        get: async () => {
          httpReads++;
          return Response.json({ data: [{ id: 'http-fresh' }] });
        }
      } as any;
      configureJsonReads(reqi, () => 'fixture-token', 'https://api.test');
      if (scenario === 'topic-event') recordNativeStartupTopicEvent();
      const started = performance.now();
      const one = readJson<any>(reqi, '/topics?page=1&limit=50', {
        timeoutMs: 100
      });
      const two = readJson<any>(reqi, '/topics?page=1&limit=50', {
        timeoutMs: 100
      });
      let value: any;
      let error = '';
      try {
        [value] = await Promise.all([one, two]);
      } catch (failure) {
        error = (failure as Error).name;
      }
      const elapsed = performance.now() - started;
      const preparedAt = value ? nativeStartupReadStartedAt(value) : null;
      rememberNativeTopicSync({
        version: 1,
        pts: '42',
        syncedAt: '2026-10-20T12:00:00.000Z'
      });
      finishNativeStartupReads();
      await new Promise(resolve => setTimeout(resolve, 20));
      if (scenario !== 'stalled')
        await readJson(reqi, '/topics?page=1&limit=50');
      return {
        value,
        samePromise: one === two,
        nativeReads,
        httpReads,
        error,
        elapsed,
        preparedAt,
        nativeStartedAt,
        planEndpoints: plan?.endpoints
      };
    }, scenario);
    expect(result.samePromise).toBe(true);
    expect(result.nativeReads).toBe(1);
    if (scenario === 'stalled') {
      expect(result.error).toBe('TimeoutError');
      expect(result.httpReads).toBe(0);
      expect(result.elapsed).toBeLessThan(500);
    } else {
      expect(result.error).toBe('');
      expect(result.value.data[0].id).toBe(
        scenario === 'prepared' ? 'native-fresh' : 'http-fresh'
      );
      expect(result.httpReads).toBe(scenario === 'prepared' ? 1 : 2);
      expect(result.planEndpoints).toEqual([
        '/topics/sync?version=1&pts=42&syncedAt=2026-10-20T12%3A00%3A00.000Z'
      ]);
      if (scenario === 'prepared')
        expect(result.preparedAt).toBe(result.nativeStartedAt);
    }
  });
}

test('ответ предыдущей сессии не попадает в стартовый план нового пользователя', async ({
  page
}) => {
  await page.route('**/__native-reads', route =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html>' })
  );
  await page.goto('/__native-reads');
  const result = await page.evaluate(async () => {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    const requested = new Promise<void>(resolve => (entered = resolve));
    let plan: any;
    (window as any).androidBridge = {};
    (window as any).Capacitor = {
      PluginHeaders: [
        {
          name: 'ChatBackgroundSync',
          methods: [
            { name: 'takeStartupRead', rtype: 'promise' },
            { name: 'saveStartupReadPlan', rtype: 'promise' }
          ]
        }
      ],
      nativePromise: async (_plugin: string, method: string, options: any) => {
        if (method === 'saveStartupReadPlan') {
          plan = options;
          return;
        }
        if (options.token === 'old-session') {
          entered();
          await gate;
        }
        return {
          available: true,
          startedAt: Date.now(),
          data: { native: true }
        };
      }
    };
    const { readJson, configureJsonReads, finishNativeStartupReads } =
      await import('/e2e/fixtures/native-startup-reads-harness.ts');
    let token = 'old-session';
    const reqi = {
      sendRequest: async () => {},
      get: async () => Response.json({ native: false })
    } as any;
    configureJsonReads(reqi, () => token, 'https://api.test');
    const previous = readJson(reqi, '/topics?page=2&limit=50');
    await requested;
    token = 'new-session';
    const current = await readJson(reqi, '/users?page=1&limit=200');
    release();
    const oldResult = await previous;
    finishNativeStartupReads();
    await new Promise(resolve => setTimeout(resolve, 20));
    return { current, oldResult, plan };
  });
  expect(result.current).toEqual({ native: true });
  expect(result.oldResult).toEqual({ native: false });
  expect(result.plan.token).toBe('new-session');
  expect(result.plan.endpoints).toEqual(['/users?page=1&limit=200']);
});
