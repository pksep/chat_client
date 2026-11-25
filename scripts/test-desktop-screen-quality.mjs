import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
// Требует отдельный QA-профиль Tauri и локальный SFU, см. doc/tauri-screen-share-quality-2026-11-25.md.
const origin = process.env.LOCAL_CALL_ORIGIN || 'http://localhost:5187';
const cdp = process.env.LOCAL_CALL_CDP || 'http://localhost:9233';
const targets = await (await fetch(`${cdp}/json/list`)).json();
const target = targets.find(
  p =>
    p.type === 'page' &&
    p.url.includes('/e2e/fixtures/screen-share-quality.html')
);
if (!target) throw new Error('Не найден собственный Tauri preview');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});
let next = 0;
const pending = new Map();
socket.onmessage = event => {
  const value = JSON.parse(event.data);
  if (value.id) {
    const task = pending.get(value.id);
    pending.delete(value.id);
    value.error ? task.reject(value.error) : task.resolve(value.result);
  }
};
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++next;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async expression => {
  const value = await call('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (value.exceptionDetails)
    throw new Error(JSON.stringify(value.exceptionDetails));
  return value.result.value;
};
const wait = async (get, predicate, label) => {
  const deadline = Date.now() + 45000;
  let result;
  while (Date.now() < deadline) {
    result = await get();
    if (predicate(result)) return result;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`${label}: ${JSON.stringify(result)}`);
};
await wait(
  () => evaluate('!!window.screenQuality'),
  value => value,
  'Фикстура Tauri не загрузилась'
);
if (!(await evaluate('!!window.__TAURI_INTERNALS__ && !!window.isTauri')))
  throw new Error('Нужен настоящий Tauri');
await evaluate('window.screenQuality.cleanup()');
const previousOrigin = await evaluate('performance.timeOrigin');
await call('Page.reload');
await wait(
  () => evaluate('performance.timeOrigin'),
  value => value !== previousOrigin,
  'Перезагрузка страницы'
);
await wait(
  () => evaluate('!!window.screenQuality'),
  value => value,
  'Перезагрузка фикстуры'
);
await evaluate('window.screenQuality.start()');
const initial = await evaluate('window.screenQuality.snapshot()');
if (!initial.openWindow || !initial.roomId)
  throw new Error('Окно/комната не открылись');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/*', route =>
    ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort()
  );
  await page.goto(
    `${origin}/e2e/fixtures/screen-share-quality.html?peer=1&room=${encodeURIComponent(initial.roomId)}`
  );
  await page.getByRole('button', { name: 'Начать локальную проверку' }).click();
  const peerState = () => page.evaluate(() => window.screenQuality.snapshot());
  const nativeState = () => evaluate('window.screenQuality.snapshot()');
  await wait(
    peerState,
    s => s.frames >= 8 && s.width === 1280 && s.height === 720,
    'Исходящий Tauri не доставил 1280×720'
  );
  const before = await peerState();
  await evaluate('window.screenQuality.minimizeMain()');
  await new Promise(resolve => setTimeout(resolve, 5000));
  const outgoing = await peerState();
  if (outgoing.frames <= before.frames || outgoing.width !== 1280)
    throw new Error('Исходящий поток остановился при сворачивании');
  await evaluate('window.screenQuality.stopScreen()');
  await page.evaluate(() => window.screenQuality.publishScreen());
  await wait(
    nativeState,
    s => s.frames >= 8 && s.width === 1280 && s.height === 720,
    'Входящий экран Tauri не декодируется в 1280×720'
  );
  for (let i = 0; i < 8; i++) {
    await evaluate('window.screenQuality.resize()');
    await page.evaluate(() => window.screenQuality.resize());
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  await evaluate('window.screenQuality.minimizeMain()');
  await new Promise(resolve => setTimeout(resolve, 5000));
  const nativeBefore = await nativeState();
  const native = await wait(
    nativeState,
    state => state.frames > nativeBefore.frames,
    'Входящий поток остановился при сворачивании'
  );
  if (native.width !== 1280)
    throw new Error('После сворачивания нарушился входящий поток');
  if (
    outgoing.sizes.some(s => s.width !== 1280 || s.height !== 720) ||
    native.sizes.some(s => s.width !== 1280 || s.height !== 720)
  )
    throw new Error('Разрешение переключалось');
  const report = {
    native: true,
    roomId: initial.roomId,
    resizeCycles: 8,
    minimizedMain: true,
    outgoingFramesWhileMinimized: outgoing.frames - before.frames,
    incoming: native,
    outgoing
  };
  await mkdir('test-results-quality/native', { recursive: true });
  await writeFile(
    'test-results-quality/native/report.json',
    JSON.stringify(report, null, 2)
  );
  console.log(
    JSON.stringify({
      native: true,
      resizeCycles: 8,
      minimizedMain: true,
      incoming: `${native.width}x${native.height}`,
      outgoing: `${outgoing.width}x${outgoing.height}`,
      outgoingFramesWhileMinimized: outgoing.frames - before.frames
    })
  );
  await page.evaluate(() => window.screenQuality.cleanup());
  await evaluate('window.screenQuality.cleanup()');
} finally {
  await evaluate('window.screenQuality.cleanup()').catch(() => undefined);
  await browser.close();
  socket.close();
}
