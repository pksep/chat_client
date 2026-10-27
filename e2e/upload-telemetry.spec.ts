import { expect, test, type Page } from '@playwright/test';

const persisted = (page: Page) =>
  page.evaluate(() =>
    JSON.parse(
      localStorage.getItem('chat.telemetry.network.pending.v1') || '[]'
    ).filter((event: any) => event.category === 'upload')
  );

async function prepareUpload(page: Page, controlled = true) {
  const received: any[] = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname))
      return route.abort();
    if (url.pathname === '/__upload-telemetry') {
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><div id="app"></div>'
      });
    }
    if (url.pathname === '/upload-test-api/telemetry/events') {
      received.push(...route.request().postDataJSON().events);
      return route.fulfill({ status: 204 });
    }
    if (url.pathname === '/upload-test-api/media/upload-target') {
      return route.fulfill({
        json: {
          objectName: 'diagnostic-photo.jpg',
          uploadUrl: `${url.origin}/upload-body?signature=private-upload-token`
        }
      });
    }
    if (url.pathname === '/upload-test-api/media/upload') {
      return route.fulfill({
        json: { objectName: 'diagnostic-photo.webp', thumbnailObjectName: null }
      });
    }
    return route.continue();
  });
  await page.goto('/__upload-telemetry');
  await page.clock.install();
  await page.evaluate(async controlled => {
    const harness = await import('/e2e/fixtures/upload-telemetry-harness.ts');
    harness.setConfig({
      CHAT_API_DOMAIN: `${location.origin}/upload-test-api`
    });
    const sdk = new harness.ChatSDK({
      apiUrl: `${location.origin}/upload-test-api`,
      wsUrl: location.origin
    });
    const state = {
      controlled: controlled ? harness.installControlledUploadXHR() : null,
      sdk,
      harness,
      done: false,
      result: null as any,
      sendAvailable: false,
      socketConnected: true,
      begin() {
        void sdk
          .uploadFile(
            new File([new Uint8Array(100)], 'photo.jpg', {
              type: 'image/jpeg'
            }),
            undefined,
            undefined,
            true,
            {
              traceId: 'diagnostic-attempt',
              topicId: 'diagnostic-topic',
              messageId: 'diagnostic-message',
              fileId: '0',
              source: 'message_attachment',
              getConnectionState: () => ({ sendAvailable: state.sendAvailable })
            }
          )
          .then(
            result => {
              state.result = result;
              state.done = true;
            },
            error => {
              state.result = { error: error.message };
              state.done = true;
            }
          );
      }
    };
    sdk.isConnected = () => state.socketConnected;
    (window as any).uploadDiagnostics = state;
  }, controlled);
  return received;
}

const beginUpload = async (page: Page) => {
  await page.evaluate(() => (window as any).uploadDiagnostics.begin());
  await expect
    .poll(() => persisted(page))
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'upload.storage_put.snapshot' })
      ])
    );
};

test('зависший PUT сохраняет байты и готовность чата без отмены загрузки; виден переход к ожиданию ответа', async ({
  page
}) => {
  await prepareUpload(page);
  await beginUpload(page);
  await page.evaluate(() =>
    (window as any).uploadDiagnostics.controlled.xhr.progress(40)
  );
  await page.clock.runFor(120_001);
  let events = await persisted(page);
  expect(
    events.filter((event: any) => event.name === 'upload.storage_put.stalled')
  ).toEqual([
    expect.objectContaining({
      traceId: 'diagnostic-attempt',
      payload: expect.objectContaining({
        phase: 'sending_body',
        loadedBytes: 40,
        totalBytes: 100,
        idleMs: 30_000,
        httpStatus: null,
        objectName: 'diagnostic-photo.jpg',
        messageId: 'diagnostic-message',
        connectionState: expect.objectContaining({
          sendAvailable: false,
          socketConnected: true
        })
      })
    })
  ]);
  await page.evaluate(() => {
    const state = (window as any).uploadDiagnostics;
    state.sendAvailable = true;
    state.harness.recordActiveUploadSnapshots('native-network-callback');
    state.controlled.xhr.progress(100);
    state.controlled.xhr.bodySent();
  });
  await page.clock.runFor(30_001);
  events = await persisted(page);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'upload.storage_put.resumed' }),
      expect.objectContaining({
        name: 'upload.storage_put.stalled',
        payload: expect.objectContaining({
          phase: 'waiting_response',
          loadedBytes: 100
        })
      }),
      expect.objectContaining({
        name: 'upload.storage_put.snapshot',
        payload: expect.objectContaining({
          reason: 'native-network-callback',
          connectionState: expect.objectContaining({ sendAvailable: true })
        })
      })
    ])
  );
  expect(
    await page.evaluate(() => ({
      aborts: (window as any).uploadDiagnostics.controlled.aborts,
      done: (window as any).uploadDiagnostics.done
    }))
  ).toEqual({ aborts: 0, done: false });
  expect(JSON.stringify(events)).not.toContain('private-upload-token');
  expect(JSON.stringify(events)).not.toContain('?signature');
});

test('частые progress не засоряют очередь; после завершения снимки и таймеры удалены', async ({
  page
}) => {
  await prepareUpload(page);
  await beginUpload(page);
  await page.evaluate(() => {
    const xhr = (window as any).uploadDiagnostics.controlled.xhr;
    for (let loaded = 1; loaded <= 100; loaded++) xhr.progress(loaded);
    xhr.bodySent();
    xhr.complete(204);
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).uploadDiagnostics.done))
    .toBe(true);
  const before = await persisted(page);
  expect(
    before.filter((event: any) => event.name === 'upload.storage_put.progress')
  ).toHaveLength(4);
  expect(
    before.filter((event: any) => event.name === 'upload.storage_put.finished')
  ).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({ httpStatus: 204, outcome: 'success' })
    })
  ]);
  await page.evaluate(() => {
    (window as any).uploadDiagnostics.harness.recordActiveUploadSnapshots(
      'after-completion'
    );
    window.dispatchEvent(new Event('offline'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(90_000);
  expect(await persisted(page)).toEqual(before);
});

test('уход в фон сохраняет последний прогресс; после возврата видна длительность паузы', async ({
  page
}) => {
  await prepareUpload(page);
  await beginUpload(page);
  await page.evaluate(() => {
    (window as any).uploadDiagnostics.controlled.xhr.progress(10);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden'
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  let events = await persisted(page);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'upload.storage_put.snapshot',
        context: expect.objectContaining({ visibility: 'hidden' }),
        payload: expect.objectContaining({
          reason: 'visibility-change',
          loadedBytes: 10
        })
      })
    ])
  );
  await page.clock.runFor(120_000);
  events = await persisted(page);
  expect(
    events.filter((event: any) => event.name === 'upload.storage_put.stalled')
  ).toEqual([]);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible'
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await persisted(page)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'upload.storage_put.stalled',
        context: expect.objectContaining({ visibility: 'visible' }),
        payload: expect.objectContaining({ loadedBytes: 10 })
      })
    ])
  );
  const stalled = (await persisted(page)).find(
    (event: any) => event.name === 'upload.storage_put.stalled'
  );
  expect(stalled.payload.idleMs).toBeGreaterThanOrEqual(120_000);
});

test('недоставленная диагностика зависания переживает reload с тем же ID события', async ({
  page
}) => {
  const received = await prepareUpload(page);
  await beginUpload(page);
  await page.evaluate(() =>
    (window as any).uploadDiagnostics.controlled.xhr.progress(25)
  );
  await page.clock.runFor(30_001);
  const before = (await persisted(page)).find(
    (event: any) => event.name === 'upload.storage_put.stalled'
  );
  expect(before).toBeTruthy();
  await page.reload();
  await page.evaluate(async () => {
    document.cookie = 'authToken=local-telemetry-test;path=/';
    const { setConfig, telemetry } = await import(
      '/e2e/fixtures/upload-telemetry-harness.ts'
    );
    setConfig({ CHAT_API_DOMAIN: `${location.origin}/upload-test-api` });
    await telemetry.flushTelemetryEvents();
  });
  expect(received).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: before.id,
        traceId: before.traceId,
        occurredAt: before.occurredAt
      })
    ])
  );
  expect(await persisted(page)).toEqual([]);
});

for (const status of [204, 408]) {
  test(`реальный XHR записывает HTTP ${status} и итог попытки`, async ({
    page
  }) => {
    await prepareUpload(page, false);
    await page.route('**/upload-body?*', route => route.fulfill({ status }));
    await beginUpload(page);
    await expect
      .poll(() => page.evaluate(() => (window as any).uploadDiagnostics.done))
      .toBe(true);
    const events = await persisted(page);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'upload.storage_put.finished',
          traceId: 'diagnostic-attempt',
          payload: expect.objectContaining({
            httpStatus: status,
            outcome: status === 204 ? 'success' : 'http_error',
            totalBytes: 100
          })
        })
      ])
    );
    expect(JSON.stringify(events)).not.toContain('private-upload-token');
  });
}

test('исключение при старте PUT завершает диагностику и освобождает наблюдателей', async ({
  page
}) => {
  await prepareUpload(page);
  await page.evaluate(() => {
    (window as any).uploadDiagnostics.controlled.throwOnSend = true;
  });
  await beginUpload(page);
  await expect
    .poll(() => page.evaluate(() => (window as any).uploadDiagnostics.done))
    .toBe(true);
  const events = await persisted(page);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'upload.storage_put.finished',
        payload: expect.objectContaining({ outcome: 'send_exception' })
      })
    ])
  );
  await page.clock.runFor(60_000);
  expect(await persisted(page)).toEqual(events);
});
