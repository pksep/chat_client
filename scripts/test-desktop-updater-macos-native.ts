import { spawn } from 'node:child_process';
import {
  cp,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

if (process.platform !== 'darwin')
  throw new Error('Эта проверка требует настоящего macOS и WebView');

const root = await mkdtemp(path.join(tmpdir(), 'sep-macos-updater-'));
const target =
  process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
const platform = process.arch === 'arm64' ? 'darwin-aarch64' : 'darwin-x86_64';
const appName = 'SEP Chat Updater QA.app';
const installed = path.join(root, 'installed', appName);
const binary = path.join(installed, 'Contents', 'MacOS', 'sep-chat');
const reports: Record<string, unknown>[] = [];
const reportFile = path.resolve(
  'test-results',
  `macos-updater-${process.arch}.json`
);
const run = (file: string, args: string[], env = process.env, quiet = false) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(file, args, {
      env,
      stdio: quiet ? 'ignore' : 'inherit'
    });
    child.once('error', reject);
    child.once('exit', code =>
      code === 0
        ? resolve()
        : reject(new Error(`${file}: код завершения ${code}`))
    );
  });
let complete!: (passed: boolean) => void;
const finished = new Promise<boolean>(resolve => {
  complete = resolve;
});
let server: ReturnType<typeof Bun.serve> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const cleanRoot = async () => {
  if (!root.startsWith(path.join(tmpdir(), 'sep-macos-updater-')))
    throw new Error('Недопустимый каталог нативной проверки');
  await rm(root, { recursive: true, force: true });
};

try {
  await mkdir(path.dirname(reportFile), { recursive: true });
  const keyPath = path.join(root, 'qa.key');
  await run(
    process.execPath,
    [
      'run',
      'tauri',
      'signer',
      'generate',
      '--ci',
      '--password=',
      '-w',
      keyPath
    ],
    process.env,
    true
  );
  const pubkey = (await readFile(`${keyPath}.pub`, 'utf8')).trim();
  const signingEnv = {
    ...process.env,
    TAURI_SIGNING_PRIVATE_KEY: (await readFile(keyPath, 'utf8')).trim(),
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ''
  };
  const frontend = path.join(root, 'frontend');
  await mkdir(frontend);
  const build = await Bun.build({
    entrypoints: ['e2e/fixtures/desktop-updater-native.ts'],
    outdir: frontend,
    target: 'browser',
    minify: true
  });
  if (!build.success) throw new Error('Не собран интерфейс проверки');
  await writeFile(
    path.join(frontend, 'index.html'),
    '<!doctype html><meta charset="utf-8"><body>Проверка macOS<script type="module" src="./desktop-updater-native.js"></script>'
  );
  const identifier = `ru.pksep.chat.updaterqa.${path.basename(root).replaceAll('-', '')}`;
  for (const version of ['1.6.100', '1.6.101']) {
    const productName = version === '1.6.100' ? 'SEP Chat Updater QA' : 'СЭП Чат Updater QA';
    const config = path.join(root, `config-${version}.json`);
    await writeFile(
      config,
      JSON.stringify({
        productName,
        identifier,
        version,
        build: { beforeBuildCommand: '', frontendDist: frontend },
        app: {
          appDirectoriesOverride: path.join(root, 'profile'),
          windows: [
            { label: 'main', title: 'SEP Chat updater QA', visible: false }
          ],
          security: {
            capabilities: [
              'default',
              {
                identifier: 'updater-qa',
                windows: ['main'],
                permissions: ['core:window:allow-close', 'process:allow-exit']
              }
            ]
          }
        },
        bundle: { targets: ['app'], createUpdaterArtifacts: true },
        plugins: {
          'deep-link': { desktop: { schemes: ['sepchat-updater-qa'] } },
          updater: {
            pubkey,
            endpoints: ['http://127.0.0.1:17883/manifest.json'],
            dangerousInsecureTransportProtocol: true
          }
        }
      })
    );
    await run(
      process.execPath,
      [
        'run',
        'tauri',
        'build',
        '--config',
        config,
        '--target',
        target,
        '--bundles',
        'app'
      ],
      signingEnv
    );
    const bundle = path.resolve(
      'src-tauri',
      'target',
      target,
      'release',
      'bundle',
      'macos'
    );
    if (version === '1.6.100') {
      await mkdir(path.dirname(installed), { recursive: true });
      await cp(path.join(bundle, appName), installed, { recursive: true });
    } else {
      await copyFile(
        path.join(bundle, `${productName}.app.tar.gz`),
        path.join(root, 'update.tar.gz')
      );
      await copyFile(
        path.join(bundle, `${productName}.app.tar.gz.sig`),
        path.join(root, 'update.tar.gz.sig')
      );
    }
  }
  let validSignature = false;
  const signature = (
    await readFile(path.join(root, 'update.tar.gz.sig'), 'utf8')
  ).trim();
  const lines = Buffer.from(signature, 'base64').toString().split(/\r?\n/);
  const signed = Buffer.from(lines[1], 'base64');
  signed[15] ^= 1;
  lines[1] = signed.toString('base64');
  const invalidSignature = Buffer.from(lines.join('\n')).toString('base64');
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 17883,
    async fetch(request) {
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
      };
      if (request.method === 'OPTIONS') return new Response(null, { headers });
      const url = new URL(request.url);
      if (url.pathname === '/manifest.json')
        return Response.json(
          {
            version: '1.6.101',
            platforms: {
              [platform]: {
                url: 'http://127.0.0.1:17883/update.tar.gz',
                signature: validSignature ? signature : invalidSignature
              }
            }
          },
          { headers }
        );
      if (url.pathname === '/update.tar.gz')
        return new Response(Bun.file(path.join(root, 'update.tar.gz')), {
          headers
        });
      if (url.pathname !== '/report' || request.method !== 'POST')
        return new Response(null, { status: 404, headers });
      const data = await request.json();
      reports.push({ at: new Date().toISOString(), ...data });
      console.log(JSON.stringify(data));
      await writeFile(reportFile, JSON.stringify(reports, null, 2));
      if (data.stage === 'invalid-signature' && data.rejected)
        validSignature = true;
      if (
        data.stage === 'restarted' &&
        (data.version !== '1.6.101' ||
          data.repeatUpdate ||
          data.draft !== 'Несохранённый текст перед обновлением' ||
          data.session !== 'synthetic-session')
      )
        complete(false);
      if (data.stage === 'closed-to-tray') {
        // LaunchServices отправляет applicationShouldHandleReopen работающему приложению.
        void run('/usr/bin/open', ['-a', installed]).catch(() =>
          complete(false)
        );
      }
      if (data.stage === 'reopened') complete(data.restored === true);
      if (data.stage === 'failed') complete(false);
      return new Response(null, { status: 204, headers });
    }
  });
  timer = setTimeout(() => complete(false), 120_000);
  await run('/usr/bin/open', ['-n', installed]);
  if (!(await finished))
    throw new Error('Нативная проверка обновления macOS не прошла');
} finally {
  clearTimeout(timer);
  server?.stop(true);
  // Останавливаем только бинарник в созданном выше каталоге с уникальным именем.
  const pattern = binary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await run('/usr/bin/pkill', ['-f', pattern], process.env, true).catch(
    () => undefined
  );
  await writeFile(reportFile, JSON.stringify(reports, null, 2));
  await cleanRoot();
}
