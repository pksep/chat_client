import { createHash, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

if (process.platform !== 'win32')
  throw new Error('Нативный smoke предназначен для Windows WebView2');
if (
  ['--links', '--shell', '--media'].filter(mode => process.argv.includes(mode))
    .length > 1
)
  throw new Error('Выберите один режим smoke: --links, --shell или --media');

const root = path.resolve(
  'test-results-native',
  `desktop-native-smoke-${randomUUID()}`
);
const profile = path.join(root, 'profile');
const source = path.join(root, 'source.txt');
const fileName = `sep-native-smoke-${randomUUID()}.txt`;
const body = Buffer.from('Локальная проверка SEP Chat\n', 'utf8');
const origin = 'http://127.0.0.1:5178';
const reports: Array<Record<string, unknown>> = [];
const isShellCheck = process.argv.includes('--shell');
const isLinksCheck = process.argv.includes('--links');
const linkLaunches: ChildProcess[] = [];
const captureSourceTitle = `SEP Capture QA ${randomUUID()}`;
let captureSourceBrowser: ChildProcess | null = null;
const removeOwnedDirectory = async (directory: string) => {
  if (
    path.dirname(directory) !== root ||
    path.dirname(root) !== path.resolve('test-results-native')
  )
    throw new Error('Недопустимый путь профиля smoke');
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200
  });
};
let finish!: (passed: boolean) => void;
const completed = new Promise<boolean>(resolve => {
  finish = resolve;
});
let downloadedPath: string | null = null;
await mkdir(root, { recursive: true });
await writeFile(source, body);
const config = path.join(root, 'tauri.conf.json');
const viteConfig = path.join(root, 'vite.config.mts');
await writeFile(
  viteConfig,
  `import { mergeConfig } from 'vite';
import base from '../../vite.config.ts';
export default async env => mergeConfig(await base(env), {
  cacheDir: ${JSON.stringify(path.join(root, 'cache'))},
  optimizeDeps: { entries: ['e2e/fixtures/desktop-native-smoke.html'] },
  server: { hmr: false }
});`
);
await writeFile(
  config,
  JSON.stringify({
    identifier: 'ru.pksep.chat.lifecycleqa',
    build: {
      beforeDevCommand: '',
      devUrl: `${origin}/e2e/fixtures/desktop-native-smoke.html${isShellCheck ? '?shell=1' : isLinksCheck ? '?links=1' : process.argv.includes('--media') ? '?media=1' : ''}`
    },
    app: {
      appDirectoriesOverride: profile,
      windows: [
        {
          label: 'main',
          title: 'SEP Chat: локальный smoke',
          decorations: false,
          additionalBrowserArgs: isShellCheck
            ? '--use-fake-device-for-media-stream'
            : undefined,
          visible: false,
          focus: false
        }
      ],
      security: {
        capabilities: [
          'default',
          {
            identifier: 'native-smoke',
            windows: ['main'],
            permissions: ['core:window:allow-close', 'process:allow-exit']
          }
        ]
      }
    },
    plugins: {
      'deep-link': {
        desktop: {
          schemes: [isLinksCheck ? 'sepchat' : 'sepchat-lifecycle-qa']
        }
      }
    }
  })
);

const api = Bun.serve({
  hostname: '127.0.0.1',
  port: 5210,
  async fetch(request) {
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    const pathname = new URL(request.url).pathname;
    if (pathname === '/file') return new Response(body, { headers });
    if (request.headers.get('origin') !== origin)
      return new Response(null, { status: 403, headers });
    if (pathname === '/fixture')
      return Response.json(
        {
          path: source,
          captureSourceTitle,
          size: body.length,
          fileName,
          sha256: createHash('sha256').update(body).digest('hex')
        },
        { headers }
      );
    if (pathname === '/change-source' && request.method === 'POST') {
      await writeFile(source, 'Изменённый исходник');
      return new Response(null, { status: 204, headers });
    }
    if (pathname === '/verify-download' && request.method === 'POST') {
      const { path: candidate } = await request.json();
      if (
        typeof candidate !== 'string' ||
        path.basename(candidate) !== fileName ||
        path.basename(path.dirname(candidate)) !== 'SEP Chat' ||
        !(await readFile(candidate)).equals(body)
      )
        return new Response(null, { status: 400, headers });
      downloadedPath = candidate;
      await unlink(downloadedPath);
      downloadedPath = null;
      return new Response(null, { status: 204, headers });
    }
    if (pathname === '/reports' && request.method === 'POST') {
      const report = await request.json();
      reports.push({ at: new Date().toISOString(), ...report });
      console.log(JSON.stringify(report));
      await writeFile(
        path.join(root, 'report.json'),
        JSON.stringify(reports, null, 2)
      );
      if (report.step === 'complete') finish(report.passed === true);
      if (report.step === 'failed') finish(false);
      const nextLink =
        report.step === 'native-call-link-cold'
          ? 'sepchat://invite?callRoom=native-warm-room&callInvite=native-warm-token'
          : report.step === 'native-app-open-ready'
            ? 'sepchat://open'
            : null;
      if (isLinksCheck && nextLink) {
        const linkLaunch = spawn(
          path.resolve('src-tauri/target/debug/sep-chat.exe'),
          [nextLink],
          { windowsHide: true, stdio: 'ignore' }
        );
        linkLaunches.push(linkLaunch);
        linkLaunch.once('error', () => finish(false));
      }
      return new Response(null, { status: 204, headers });
    }
    return new Response(null, { status: 404, headers });
  }
});

const vite = spawn(
  'node',
  [
    path.resolve('node_modules/vite/bin/vite.js'),
    '--config',
    viteConfig,
    '--host',
    '127.0.0.1',
    '--port',
    '5178',
    '--strictPort'
  ],
  { windowsHide: true, stdio: 'inherit' }
);
let child: ChildProcess | null = null;
const timeout = setTimeout(() => finish(false), 15 * 60_000);
try {
  const deadline = Date.now() + 60_000;
  let serverReady = false;
  while (!serverReady && Date.now() < deadline) {
    if (vite.exitCode !== null) throw new Error('Тестовый Vite завершился');
    try {
      const response = await fetch(
        `${origin}/e2e/fixtures/desktop-native-smoke.html`,
        {
          signal: AbortSignal.timeout(2000)
        }
      );
      serverReady = response.ok;
    } catch {
      /* Сервер ещё запускается. */
    }
    if (!serverReady) await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!serverReady) throw new Error('Тестовый Vite не запустился');
  if (isShellCheck) {
    captureSourceBrowser = spawn(
      'node',
      [
        'scripts/desktop-shell-source.mjs',
        `${origin}/e2e/fixtures/desktop-capture-source.html?title=${encodeURIComponent(captureSourceTitle)}`
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'] }
    );
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Не открылось синтетическое окно захвата')),
        45_000
      );
      captureSourceBrowser!.stdout!.on('data', chunk => {
        if (String(chunk).includes('SOURCE_READY')) {
          clearTimeout(timer);
          resolve();
        }
      });
      captureSourceBrowser!.once('error', reject);
      captureSourceBrowser!.once('exit', code => {
        clearTimeout(timer);
        reject(new Error(`Окно захвата завершилось: ${code}`));
      });
    });
  }
  child = spawn(
    process.execPath,
    [
      'run',
      'tauri',
      'dev',
      '--no-watch',
      '--config',
      config,
      ...(isLinksCheck
        ? [
            '--',
            '--',
            'sepchat://invite?callRoom=native-cold-room&callInvite=native-cold-token&organization=https%3A%2F%2Fold.example.invalid'
          ]
        : [])
    ],
    { windowsHide: true, stdio: 'inherit' }
  );
  child.once('error', () => finish(false));
  child.once('exit', () => finish(false));
  const passed = await completed;
  console.log(
    JSON.stringify({ passed, report: path.join(root, 'report.json') })
  );
  if (!passed) process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  // Только дерево процесса, запущенного этим стендом; основной SEP Chat не затрагивается.
  for (const taskChild of [
    child,
    vite,
    captureSourceBrowser,
    ...linkLaunches
  ]) {
    if (!taskChild || taskChild.exitCode !== null || !taskChild.pid) continue;
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (taskChild.exitCode === null) {
      const stop = spawn(
        'taskkill',
        ['/PID', String(taskChild.pid), '/T', '/F'],
        {
          windowsHide: true,
          stdio: 'ignore'
        }
      );
      await new Promise(resolve => stop.once('exit', resolve));
    }
  }
  api.stop(true);
  if (downloadedPath) await unlink(downloadedPath);
  await unlink(source);
  await unlink(config);
  await unlink(viteConfig);
  // Каталоги созданы выше с UUID и находятся строго внутри test-results-native.
  await removeOwnedDirectory(profile);
  await removeOwnedDirectory(path.join(root, 'cache'));
}
