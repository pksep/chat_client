import { expect, test } from '@playwright/test';

// В среде без аудиоустройства Chromium иначе оставляет audio.currentTime на нуле.
// Null sink сохраняет настоящий декодер и Web Audio, не включая динамики.
test.use({ launchOptions: { args: ['--disable-audio-output'] } });

test('реальный локальный LiveKit: видео, декодирование аудио, переподключение и новый звонок', async ({
  page,
  context,
  request
}, testInfo) => {
  test.skip(
    process.env.LIVEKIT_LOCAL_QA !== '1',
    'Требуются локальный LiveKit и tauri-call-server.ts'
  );
  test.setTimeout(120_000);
  const native = process.env.TAURI_NATIVE_QA === '1';
  const run = native ? 'native' : `browser-main-${Date.now()}`;
  const api = 'http://127.0.0.1:5209';
  let reportOffset = 0;
  const allReports = async () => {
    const response = await request.get(`${api}/reports`);
    return (await response.json())
      .filter((item: any) => item.run === run)
      .map((item: any) => item.report);
  };
  const reports = async () => (await allReports()).slice(reportOffset);
  const command = async (command: string) => {
    const response = await request.post(`${api}/commands?run=${run}`, {
      data: { command }
    });
    expect(response.ok()).toBeTruthy();
  };
  await context.route('**/*', route =>
    ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort()
  );
  const main = native ? null : await context.newPage();
  try {
    if (main) {
      await main.goto(`/e2e/fixtures/tauri-call.html?run=${run}`);
      await main.getByRole('heading').click();
    }
    await expect
      .poll(
        async () =>
          (await reports()).filter((row: any) => row.step === 'started').length,
        { timeout: 45_000 }
      )
      .toBeGreaterThan(0);
    reportOffset = (await allReports()).findLastIndex(
      (row: any) => row.step === 'started'
    );
    let started = (await reports()).find((row: any) => row.step === 'started');
    expect(started).toMatchObject({
      tauri: native,
      screenActive: true,
      tracks: ['live']
    });
    await page.goto('/e2e/fixtures/tauri-call-peer.html');
    await page.getByRole('heading').click();
    await expect
      .poll(() => page.evaluate(() => !!(window as any).livekitPeer))
      .toBe(true);
    const connect = (roomId: string) =>
      page.evaluate(room => (window as any).livekitPeer.connect(room), roomId);
    const snapshot = () =>
      page.evaluate(() => (window as any).livekitPeer.snapshot());
    await connect(started.roomId);
    await expect
      .poll(async () => (await snapshot()).frames, { timeout: 30_000 })
      .toBeGreaterThan(4);
    await expect
      .poll(
        async () =>
          (await reports()).some(
            (row: any) => row.step === 'received-frames' && row.frames >= 5
          ),
        { timeout: 30_000 }
      )
      .toBe(true);
    await command('mic-on');
    await expect
      .poll(async () =>
        (await reports()).find((row: any) => row.step === 'mic-on')
      )
      .toMatchObject({ micActive: true });
    await command('stats');
    await expect
      .poll(async () => (await snapshot()).packets, { timeout: 15_000 })
      .toBeGreaterThan(5);
    const hasTone = (
      probes: Array<{ rms: number; frequencyHz: number }>,
      hz: number
    ) =>
      probes.some(
        probe => probe.rms > 0.01 && Math.abs(probe.frequencyHz - hz) < 60
      );
    await expect
      .poll(async () => hasTone((await snapshot()).decodedAudio, 440), {
        timeout: 15_000
      })
      .toBe(true);
    await expect
      .poll(async () => (await snapshot()).samples)
      .toBeGreaterThan(1000);
    await command('stats');
    await expect
      .poll(
        async () =>
          (await reports()).find((row: any) => row.step === 'stats')
            ?.receivedAudio.packets,
        { timeout: 15_000 }
      )
      .toBeGreaterThan(5);
    await expect
      .poll(
        async () => {
          await command('stats');
          const stats = (await reports())
            .filter((row: any) => row.step === 'stats')
            .at(-1);
          return (
            stats?.receivedAudio.samples > 1000 &&
            hasTone(stats?.receivedAudio.decodedAudio ?? [], 660)
          );
        },
        { timeout: 15_000 }
      )
      .toBe(true);
    await testInfo.attach('decoded-audio.json', {
      body: JSON.stringify({
        native,
        peer: await snapshot(),
        main: (await reports())
          .filter((row: any) => row.step === 'stats')
          .at(-1)
      }),
      contentType: 'application/json'
    });
    await command('mic-off');
    await expect
      .poll(async () =>
        (await reports()).find((row: any) => row.step === 'mic-off')
      )
      .toMatchObject({ micActive: false });
    await expect.poll(async () => (await snapshot()).muted).toBe(true);
    await expect
      .poll(async () =>
        (await snapshot()).decodedAudio.every(
          (probe: { rms: number }) => probe.rms < 0.001
        )
      )
      .toBe(true);
    await command('signal-reconnect');
    await expect
      .poll(async () =>
        (await reports()).some((row: any) => row.step === 'reconnect-requested')
      )
      .toBe(true);
    await expect
      .poll(
        async () => {
          await command('stats');
          const stats = (await reports())
            .filter((row: any) => row.step === 'stats')
            .at(-1);
          const states: string[] = stats?.connectionStates ?? [];
          const reconnect = states.lastIndexOf('signalReconnecting');
          return (
            reconnect >= 0 &&
            states.slice(reconnect + 1).includes('connected') &&
            states.at(-1) === 'connected'
          );
        },
        { timeout: 20_000 }
      )
      .toBe(true);
    const framesBeforeReconnect = (await snapshot()).frames;
    await expect
      .poll(async () => (await snapshot()).frames)
      .toBeGreaterThan(framesBeforeReconnect + 4);
    await command('cycle-screen');
    await expect
      .poll(async () =>
        (await reports()).find((row: any) => row.step === 'screen-stopped')
      )
      .toMatchObject({ screenActive: false, tracks: ['ended'] });
    await expect
      .poll(async () =>
        (await reports()).find((row: any) => row.step === 'screen-restarted')
      )
      .toMatchObject({
        screenActive: true,
        tracks: ['ended', 'live'],
        captures: 2
      });
    await expect
      .poll(async () => (await snapshot()).subscriptions, { timeout: 20_000 })
      .toBe(2);
    const before = (await snapshot()).frames;
    await expect
      .poll(async () => (await snapshot()).frames)
      .toBeGreaterThan(before + 4);
    await command('leave');
    await expect
      .poll(async () =>
        (await reports()).find((row: any) => row.step === 'left')
      )
      .toMatchObject({
        screenActive: false,
        tracks: ['ended', 'ended']
      });
    await expect.poll(async () => (await snapshot()).peers).toBe(0);
    await page.evaluate(() => (window as any).livekitPeer.disconnect());
    await command('start');
    await expect
      .poll(
        async () =>
          (await reports()).filter((row: any) => row.step === 'started').length
      )
      .toBe(2);
    const next = (await reports())
      .filter((row: any) => row.step === 'started')
      .at(-1);
    expect(next.roomId).not.toBe(started.roomId);
    started = next;
    await connect(started.roomId);
    const framesBeforeRestart = (await snapshot()).frames;
    await expect
      .poll(async () => (await snapshot()).frames, { timeout: 30_000 })
      .toBeGreaterThan(framesBeforeRestart + 4);
    expect(
      (await reports()).filter((row: any) => row.step === 'error')
    ).toEqual([]);
  } catch (error) {
    console.log(
      JSON.stringify({
        peer: await page.evaluate(() =>
          (window as any).livekitPeer?.snapshot()
        ),
        reports: (await reports()).slice(-4)
      })
    );
    throw error;
  } finally {
    await command('leave').catch(() => {});
    await page
      .evaluate(() => (window as any).livekitPeer?.disconnect())
      .catch(() => {});
    await main?.close();
  }
});
