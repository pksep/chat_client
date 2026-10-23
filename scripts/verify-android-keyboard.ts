import { chromium, expect } from 'playwright/test';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const serial = process.env.ANDROID_KEYBOARD_SERIAL || 'emulator-5556';
const packageId =
  process.env.ANDROID_KEYBOARD_PACKAGE || 'sep.pksep.app.performance';
const measureFrames = process.env.ANDROID_KEYBOARD_MEASURE !== '0';
const checkPicker = process.env.ANDROID_KEYBOARD_PICKER === '1';
const cycles = Math.max(1, Number(process.env.ANDROID_KEYBOARD_CYCLES) || 4);
if (!['sep.pksep.app', 'sep.pksep.app.performance'].includes(packageId))
  throw new Error('Укажите пакет чата для проверки');
const adbPath = resolve(
  process.env.LOCALAPPDATA!,
  'Android/Sdk/platform-tools/adb.exe'
);
const execute = promisify(execFile);
const adb = async (...args: string[]) =>
  (
    await execute(adbPath, ['-s', serial, ...args], {
      windowsHide: true,
      timeout: 60_000
    })
  ).stdout;
const output = resolve('../artifacts/android-keyboard');
await mkdir(output, { recursive: true });
await adb(
  'shell',
  'am',
  'start',
  '-n',
  `${packageId}/sep.pksep.app.MainActivity`
);
let pid = '';
await expect
  .poll(
    async () => {
      try {
        pid = (await adb('shell', 'pidof', packageId)).trim().split(' ')[0];
      } catch {
        pid = '';
      }
      return pid;
    },
    { timeout: 30_000 }
  )
  .not.toBe('');
await adb(
  'forward',
  'tcp:9230',
  `localabstract:webview_devtools_remote_${pid}`
);
await expect
  .poll(
    async () => {
      try {
        return (await fetch('http://127.0.0.1:9230/json/version')).ok;
      } catch {
        return false;
      }
    },
    { timeout: 30_000 }
  )
  .toBe(true);
const endpoint = (
  await (await fetch('http://127.0.0.1:9230/json/version')).json()
).webSocketDebuggerUrl;
const browser = await chromium.connectOverCDP(endpoint, { noDefaults: true });
const page = browser.contexts()[0].pages()[0];
const cdp = await browser.contexts()[0].newCDPSession(page);
const trace = process.env.ANDROID_KEYBOARD_TRACE === '1';
let traceRunning = false;
let recording: ReturnType<typeof spawn> | undefined;
try {
  if (process.env.ANDROID_KEYBOARD_CHAT_PATH)
    await page.goto(
      new URL(process.env.ANDROID_KEYBOARD_CHAT_PATH, page.url()).href,
      { waitUntil: 'domcontentloaded' }
    );
  await expect(page.locator('.chat__input .ProseMirror')).toBeVisible({
    timeout: 60_000
  });
  await expect
    .poll(() => page.evaluate(() => innerHeight))
    .toBeGreaterThan(100);
  await expect
    .poll(() => page.evaluate(() => !!window.__sepAndroidKeyboard), {
      timeout: 10_000
    })
    .toBe(true);
  if (
    await page
      .locator('.chat__input')
      .evaluate(el => el.getBoundingClientRect().bottom < innerHeight - 1)
  ) {
    await adb('shell', 'input', 'keyevent', '4');
    await expect
      .poll(
        () =>
          page
            .locator('.chat__input')
            .evaluate(el =>
              Math.abs(el.getBoundingClientRect().bottom - innerHeight)
            ),
        { timeout: 10_000 }
      )
      .toBeLessThan(1);
  }
  await page
    .locator('.chat__input .ProseMirror')
    .evaluate(el => (el as HTMLElement).blur());
  await page.waitForTimeout(1500);
  await adb('shell', 'dumpsys', 'gfxinfo', packageId, 'reset');
  if (trace) {
    await cdp.send('Tracing.start', {
      categories:
        'devtools.timeline,blink.user_timing,cc,benchmark,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame',
      transferMode: 'ReturnAsStream'
    });
    traceRunning = true;
  }
  await page.evaluate(measure => {
    const frames: any[] = [];
    const nativeFrames: any[] = [];
    const longTasks: any[] = [];
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries())
        longTasks.push({ start: entry.startTime, duration: entry.duration });
    });
    observer.observe({ type: 'longtask', buffered: false });
    const original = window.__sepAndroidKeyboard!;
    const wrapped: typeof original = (bottom, phase) => {
      const frame = {
        time: performance.now(),
        bottom,
        phase,
        duration: 0
      };
      nativeFrames.push(frame);
      original(bottom, phase);
      frame.duration = performance.now() - frame.time;
    };
    window.__sepAndroidKeyboard = wrapped;
    (window as any).__keyboardCheck = {
      frames,
      nativeFrames,
      original,
      wrapped,
      observer,
      longTasks,
      stop: false
    };
    const sample = (time: number) => {
      const input = document
        .querySelector('.chat__input')!
        .getBoundingClientRect();
      const messages = document.querySelectorAll(
        '.chat__message-wrapper [data-message-id]'
      );
      const last = messages[messages.length - 1]?.getBoundingClientRect();
      const wallpaper = document
        .querySelector('.chat-container__wallpaper-image')
        ?.getBoundingClientRect();
      frames.push({
        time,
        height: innerHeight,
        inputTop: input.top,
        inputBottom: input.bottom,
        lastBottom: last?.bottom,
        wallpaperTop: wallpaper?.top,
        wallpaperHeight: wallpaper?.height,
        scrollY
      });
      if (!(window as any).__keyboardCheck.stop) requestAnimationFrame(sample);
    };
    if (measure) requestAnimationFrame(sample);
  }, measureFrames);
  const closed = await page
    .locator('.chat__input')
    .evaluate(el => el.getBoundingClientRect().bottom);
  const viewportHeight = await page.evaluate(() => innerHeight);
  console.log(JSON.stringify({ initialInputBottom: closed, viewportHeight }));
  if (process.env.ANDROID_KEYBOARD_RECORD !== '0')
    recording = spawn(
      adbPath,
      [
        '-s',
        serial,
        'shell',
        'screenrecord',
        '--size',
        '720x1600',
        '--bit-rate',
        '6000000',
        '--time-limit',
        checkPicker ? '24' : '16',
        '/sdcard/chat-keyboard-test.mp4'
      ],
      { windowsHide: true, stdio: 'ignore' }
    );
  for (let cycle = 0; cycle < cycles; cycle++) {
    const input = await page.locator('.chat__input .ProseMirror').boundingBox();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: input!.x + input!.width / 2, y: input!.y + input!.height / 2 }
      ]
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });
    await expect
      .poll(
        () =>
          page
            .locator('.chat__input')
            .evaluate(el => el.getBoundingClientRect().bottom),
        { timeout: 10_000 }
      )
      .toBeLessThan(closed - 100);
    await page.waitForTimeout(700);
    await adb('shell', 'input', 'keyevent', '4');
    await expect
      .poll(
        () =>
          page
            .locator('.chat__input')
            .evaluate(el => el.getBoundingClientRect().bottom),
        { timeout: 10_000 }
      )
      .toBe(closed);
    await page.waitForTimeout(700);
  }
  if (checkPicker) {
    const touch = async (selector: string) => {
      const bounds = await page.locator(selector).boundingBox();
      if (!bounds) throw new Error(`Не найдена кнопка: ${selector}`);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
        ]
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: []
      });
    };
    const inputBottom = () =>
      page
        .locator('.chat__input')
        .evaluate(el => el.getBoundingClientRect().bottom);
    const picker = page.locator('.chat__input .emoji-picker--open:visible');
    const pickerGap = () =>
      picker.evaluate(
        el =>
          el.closest('.chat__input')!.getBoundingClientRect().top -
          el.getBoundingClientRect().bottom
      );
    await touch('.chat__input .ProseMirror');
    await expect.poll(inputBottom).toBeLessThan(closed - 100);
    await page.waitForTimeout(400);
    const keyboardBottom = await inputBottom();
    await touch('.chat__input .smile-button:visible');
    await expect.poll(inputBottom).toBe(keyboardBottom);
    await expect(picker).toHaveCSS('opacity', '1');
    await page.waitForTimeout(400);
    expect(await inputBottom()).toBe(keyboardBottom);
    await expect(page.locator('.chat__input .ProseMirror')).toBeFocused();
    await expect(picker).toBeInViewport();
    await expect.poll(pickerGap).toBeGreaterThanOrEqual(4);
    await expect.poll(pickerGap).toBeLessThanOrEqual(7);
    await touch('.chat__input .emoji-picker--open:visible .v3-search input');
    await expect.poll(inputBottom).toBeLessThan(closed - 100);
    await page.waitForTimeout(400);
    await expect.poll(pickerGap).toBeGreaterThanOrEqual(4);
    await expect.poll(pickerGap).toBeLessThanOrEqual(7);
    await expect(picker).toBeInViewport();
    await adb('shell', 'input', 'keyevent', '4');
    await expect.poll(inputBottom).toBe(closed);
    if (await picker.count()) await touch('.chat__input .smile-button:visible');
    await touch('.chat__input .attach-file-button:visible');
    await expect(
      page.locator('.chat__input .popover-yui-kit__content:visible')
    ).toBeInViewport();
    await touch('.chat__input .attach-file-button:visible');
    await touch('.chat__input .ProseMirror');
    await expect.poll(inputBottom).toBeLessThan(closed - 100);
    await page.waitForTimeout(400);
    const raised = await inputBottom();
    await touch('.chat__input .attach-file-button:visible');
    await expect(
      page.locator('.chat__input .popover-yui-kit__content:visible')
    ).toBeInViewport();
    await adb('shell', 'input', 'keyevent', '4');
    await expect(
      page.locator('.chat__input .popover-yui-kit__content:visible')
    ).toHaveCount(0);
    expect(await inputBottom()).toBe(raised);
    await adb('shell', 'input', 'keyevent', '4');
    await expect.poll(inputBottom).toBe(closed);
    console.log(
      'Эмодзи с открытой клавиатурой, поиск и скрепка проверены в APK'
    );
  }
  const result = await page.evaluate(() => {
    const state = (window as any).__keyboardCheck;
    state.stop = true;
    if (window.__sepAndroidKeyboard === state.wrapped)
      window.__sepAndroidKeyboard = state.original;
    state.observer.disconnect();
    return {
      frames: state.frames,
      nativeFrames: state.nativeFrames,
      longTasks: state.longTasks
    };
  });
  await writeFile(
    resolve(output, 'frames.json'),
    JSON.stringify({ serial, packageId, ...result }, null, 2)
  );
  expect(
    result.nativeFrames.filter((frame: any) => frame.phase === 'prepare').length
  ).toBeGreaterThanOrEqual(cycles * 2);
  if (measureFrames)
    expect(
      new Set(result.frames.map((frame: any) => frame.inputBottom)).size
    ).toBeGreaterThan(8);
  for (const frame of result.frames) {
    expect(frame.height).toBe(viewportHeight);
    expect(frame.wallpaperTop).toBe(result.frames[0].wallpaperTop);
    expect(frame.wallpaperHeight).toBe(result.frames[0].wallpaperHeight);
    expect(frame.scrollY).toBe(0);
  }
  console.log(
    JSON.stringify(
      {
        serial,
        packageId,
        frames: result.frames.length,
        nativeFrames: result.nativeFrames.length,
        viewportHeights: [
          ...new Set(result.frames.map((frame: any) => frame.height))
        ],
        inputPositions: new Set(
          result.frames.map((frame: any) => frame.inputBottom)
        ).size,
        output
      },
      null,
      2
    )
  );
  const graphics = await adb('shell', 'dumpsys', 'gfxinfo', packageId);
  await writeFile(resolve(output, 'graphics.txt'), graphics);
  console.log(graphics.slice(0, 650));
} finally {
  if (traceRunning) {
    const completed = new Promise<any>(done =>
      cdp.once('Tracing.tracingComplete', done)
    );
    await cdp.send('Tracing.end');
    const { stream } = await completed;
    let contents = '';
    let eof = false;
    while (!eof) {
      const chunk = await cdp.send('IO.read', { handle: stream });
      contents += chunk.base64Encoded
        ? Buffer.from(chunk.data, 'base64').toString('utf8')
        : chunk.data;
      eof = chunk.eof;
    }
    await cdp.send('IO.close', { handle: stream });
    await writeFile(resolve(output, 'keyboard-trace.json'), contents);
  }
  if (recording) {
    if (recording.exitCode === null)
      await new Promise<void>(done => recording!.once('exit', () => done()));
    await adb(
      'pull',
      '/sdcard/chat-keyboard-test.mp4',
      resolve(output, 'keyboard.mp4')
    );
    await adb('shell', 'rm', '/sdcard/chat-keyboard-test.mp4');
  }
  await page
    .evaluate(() => {
      const state = (window as any).__keyboardCheck;
      if (state) {
        state.stop = true;
        state.observer.disconnect();
        if (window.__sepAndroidKeyboard === state.wrapped)
          window.__sepAndroidKeyboard = state.original;
      }
    })
    .catch(() => {});
  await browser.close();
  await adb('forward', '--remove', 'tcp:9230');
}
