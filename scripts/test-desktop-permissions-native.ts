import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

if (process.platform !== 'win32')
  throw new Error('Эта проверка требует Windows WebView2');
const root = path.resolve('test-results-native', `permissions-${randomUUID()}`);
const profile = path.join(root, 'profile');
const origin = 'http://127.0.0.1:5179';
await mkdir(root, { recursive: true });
const config = path.join(root, 'tauri.conf.json');
await writeFile(
  config,
  JSON.stringify({
    identifier: 'ru.pksep.chat.permissionsqa',
    build: {
      beforeDevCommand: '',
      devUrl: `${origin}/e2e/fixtures/desktop-permissions-native.html`
    },
    app: {
      appDirectoriesOverride: profile,
      windows: [
        {
          label: 'main',
          title: 'SEP permissions QA',
          visible: false,
          focus: false,
          additionalBrowserArgs: '--use-fake-device-for-media-stream'
        }
      ],
      security: {
        capabilities: [
          'default',
          {
            identifier: 'permissions-qa',
            windows: ['main'],
            permissions: ['process:allow-exit']
          }
        ]
      }
    },
    plugins: {
      'deep-link': { desktop: { schemes: ['sepchat-permissions-qa'] } }
    }
  })
);
let phase = 1;
let resolveReport: (passed: boolean) => void = () => {};
const reports: unknown[] = [];
const api = Bun.serve({
  hostname: '127.0.0.1',
  port: 5211,
  async fetch(request) {
    const headers = { 'Access-Control-Allow-Origin': origin };
    if (request.headers.get('origin') !== origin)
      return new Response(null, { status: 403 });
    if (new URL(request.url).pathname === '/phase')
      return Response.json(phase, { headers });
    const report = await request.json();
    reports.push(report);
    console.log(JSON.stringify(report));
    await writeFile(
      path.join(root, 'report.json'),
      JSON.stringify(reports, null, 2)
    );
    resolveReport(report.phase === phase && report.passed === true);
    return new Response(null, { status: 204, headers });
  }
});
const children: ChildProcess[] = [];
const vite = spawn(
  process.execPath,
  ['run', 'vite', '--host', '127.0.0.1', '--port', '5179', '--strictPort'],
  { windowsHide: true, stdio: 'inherit' }
);
children.push(vite);
try {
  const deadline = Date.now() + 60_000;
  while (true) {
    try {
      if (
        (
          await fetch(
            `${origin}/e2e/fixtures/desktop-permissions-native.html`,
            { signal: AbortSignal.timeout(2000) }
          )
        ).ok
      )
        break;
    } catch {
      /* Vite запускается. */
    }
    if (Date.now() > deadline || vite.exitCode !== null)
      throw new Error('Не запустился локальный Vite');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  for (phase = 1; phase <= 3; phase++) {
    let timeout: ReturnType<typeof setTimeout>;
    const report = new Promise<boolean>(resolve => {
      resolveReport = resolve;
      timeout = setTimeout(() => resolve(false), 10 * 60_000);
    });
    const child = spawn(
      process.execPath,
      ['run', 'tauri', 'dev', '--no-watch', '--config', config],
      { windowsHide: true, stdio: 'inherit' }
    );
    children.push(child);
    const stopped = new Promise<void>(resolve =>
      child.once('exit', () => {
        resolveReport(false);
        resolve();
      })
    );
    child.once('error', () => resolveReport(false));
    const passed = await report;
    clearTimeout(timeout!);
    if (!passed) throw new Error(`Не пройдена фаза ${phase}`);
    let stopTimeout: ReturnType<typeof setTimeout>;
    try {
      await Promise.race([
        stopped,
        new Promise<never>((_, reject) => {
          stopTimeout = setTimeout(
            () => reject(new Error('Процесс QA не завершился')),
            30_000
          );
        })
      ]);
    } finally {
      clearTimeout(stopTimeout!);
    }
  }
  console.log(
    JSON.stringify({
      passed: true,
      report: path.join(root, 'report.json'),
      nativeProcessRestarts: 2
    })
  );
} finally {
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    const stop = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore'
    });
    await new Promise(resolve => stop.once('exit', resolve));
  }
  api.stop(true);
  if (
    path.dirname(root) !== path.resolve('test-results-native') ||
    path.dirname(profile) !== root
  )
    throw new Error('Некорректный путь профиля QA');
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200
  });
}
