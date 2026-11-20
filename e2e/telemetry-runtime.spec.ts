import { expect, test } from '@playwright/test';

const cases = [
  { name: 'браузер Windows', ua: 'Windows NT 10.0 Tauri', os: 'windows' },
  { name: 'браузер Linux', ua: 'X11; Linux x86_64', os: 'linux' },
  { name: 'браузер macOS', ua: 'Macintosh; Intel Mac OS X', os: 'macos' },
  { name: 'браузер Android', ua: 'Linux; Android 14', os: 'android' },
  {
    name: 'браузер iOS',
    ua: 'iPhone; CPU iPhone OS 18_0 like Mac OS X',
    os: 'ios'
  },
  { name: 'неизвестная ОС браузера', ua: 'TestAgent', os: 'unknown' },
  { name: 'Client Hints', ua: 'TestAgent', hint: 'Windows', os: 'windows' },
  {
    name: 'Tauri Windows',
    ua: 'Windows NT 10.0',
    nativeOs: 'windows',
    os: 'windows'
  },
  {
    name: 'Tauri Linux',
    ua: 'Windows NT 10.0',
    nativeOs: 'linux',
    os: 'linux'
  },
  {
    name: 'Tauri macOS',
    ua: 'Windows NT 10.0',
    nativeOs: 'macos',
    os: 'macos'
  },
  {
    name: 'старый Tauri без команды',
    ua: 'X11; Linux x86_64',
    nativeOs: 'missing',
    os: 'linux'
  }
];

for (const scenario of cases) {
  test(`общий контекст телеметрии: ${scenario.name}`, async ({ page }) => {
    const events: any[] = [];
    await page.route('**/__telemetry-runtime', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><script type="module" src="/@vite/client"></script>'
      })
    );
    await page.route('**/telemetry-test-api/telemetry/events', route => {
      events.push(...route.request().postDataJSON().events);
      return route.fulfill({ json: { accepted: events.length } });
    });
    await page.goto('/__telemetry-runtime');
    const before = await page.evaluate(async scenario => {
      document.cookie = 'authToken=telemetry-test;path=/';
      Object.defineProperties(navigator, {
        userAgent: { value: scenario.ua, configurable: true },
        platform: { value: '', configurable: true },
        maxTouchPoints: { value: 0, configurable: true },
        userAgentData: {
          value: { platform: scenario.hint || '' },
          configurable: true
        }
      });
      const win = window as any;
      win.runtimeCommands = [];
      if (scenario.nativeOs) {
        win.isTauri = true;
        win.__TAURI_INTERNALS__ = {
          invoke: (command: string) => {
            win.runtimeCommands.push(command);
            if (command !== 'get_telemetry_os') return Promise.resolve(null);
            return new Promise((resolve, reject) => {
              win.resolveNativeOs = () =>
                scenario.nativeOs === 'missing'
                  ? reject(new Error('Команда отсутствует в старой сборке'))
                  : resolve(scenario.nativeOs);
            });
          }
        };
      }
      const fixture = await import(
        '/e2e/fixtures/telemetry-storage-harness.ts'
      );
      fixture.setConfig({
        CHAT_API_DOMAIN: `${location.origin}/telemetry-test-api`
      });
      win.runtimeFixture = fixture;
      fixture.telemetry.recordTelemetryEvent({
        category: 'chat',
        name: 'chat.runtime.before_native'
      });
      const before = { ...fixture.telemetryDevice.getTelemetryDeviceContext() };
      win.resolveNativeOs?.();
      return before;
    }, scenario);
    const runtime = scenario.nativeOs ? 'tauri' : 'browser';
    const native = scenario.nativeOs && scenario.nativeOs !== 'missing';
    const osSource = native
      ? 'tauri_native'
      : scenario.hint
        ? 'user_agent_data'
        : 'navigator';
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as any
            ).runtimeFixture.telemetryDevice.getTelemetryDeviceContext()
              .osSource
        )
      )
      .toBe(osSource);
    const commands = await page.evaluate(async () => {
      const { telemetry } = (window as any).runtimeFixture;
      for (const category of ['chat', 'call', 'lifecycle']) {
        telemetry.recordTelemetryEvent({
          category,
          name: `${category}.runtime.after_native`
        });
      }
      await telemetry.flushTelemetryEvents();
      return (window as any).runtimeCommands;
    });
    const matching = events.filter(event =>
      event.name.endsWith('runtime.after_native')
    );
    expect(matching).toHaveLength(3);
    for (const event of matching) {
      expect(event.context).toMatchObject({
        runtime,
        os: scenario.os,
        osSource,
        platform: 'web',
        isNative: false,
        device: { runtime, os: scenario.os, osSource }
      });
    }
    expect(
      events.find(event => event.name === 'chat.runtime.before_native').context
    ).toMatchObject({
      runtime,
      os: before.os,
      osSource: before.osSource
    });
    expect(before.osSource).toBe(
      scenario.hint ? 'user_agent_data' : 'navigator'
    );
    expect(
      commands.filter((command: string) => command === 'get_telemetry_os')
    ).toHaveLength(scenario.nativeOs ? 1 : 0);
  });
}
