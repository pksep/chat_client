import { spawn } from 'node:child_process';
import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  readdir
} from 'node:fs/promises';
import path from 'node:path';

if (process.platform !== 'win32')
  throw new Error('Этот smoke проверяет NSIS updater на Windows');
const productionIntegration = async () => {
  const child = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$values = [ordered]@{}
foreach ($entry in @(
  @{name='protocol'; path='Software\\Classes\\sepchat'; value=''},
  @{name='protocolMarker'; path='Software\\Classes\\sepchat'; value='URL Protocol'},
  @{name='protocolCommand'; path='Software\\Classes\\sepchat\\shell\\open\\command'; value=''},
  @{name='protocolIcon'; path='Software\\Classes\\sepchat\\DefaultIcon'; value=''},
  @{name='autostart'; path='Software\\Microsoft\\Windows\\CurrentVersion\\Run'; value='SEP Chat'}
)) {
  $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($entry.path)
  try { $values[$entry.name] = if ($key) { $key.GetValue($entry.value) } else { $null } }
  finally { if ($key) { $key.Dispose() } }
}
$values | ConvertTo-Json -Compress`
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'] }
  );
  let output = '';
  child.stdout!.setEncoding('utf8');
  child.stdout!.on('data', chunk => {
    output += chunk;
  });
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code =>
      code === 0
        ? resolve()
        : reject(new Error('Не удалось проверить регистрацию рабочего клиента'))
    );
  });
  return JSON.parse(output) as Record<string, string | null>;
};
const integrationBefore = await productionIntegration();
const root = path.resolve('.codex/desktop-updater-native');
await mkdir(root, { recursive: true });
const run = (file: string, args: string[], env = process.env, quiet = false) =>
  new Promise<number>((resolve, reject) => {
    const child = spawn(file, args, {
      env,
      windowsHide: true,
      stdio: quiet ? 'ignore' : 'inherit'
    });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
const mustRun = async (...args: Parameters<typeof run>) => {
  const code = await run(...args);
  if (code) throw new Error(`Command failed (${code}): ${args[0]}`);
};
const keyPath = path.join(root, 'test.key');
if (!(await Bun.file(keyPath).exists())) {
  await mustRun(
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
}
const pubkey = (await readFile(`${keyPath}.pub`, 'utf8')).trim();
const signingEnv = {
  ...process.env,
  TAURI_SIGNING_PRIVATE_KEY: (await readFile(keyPath, 'utf8')).trim(),
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ''
};
const frontend = path.join(root, 'frontend');
await mkdir(frontend, { recursive: true });
const build = await Bun.build({
  entrypoints: ['e2e/fixtures/desktop-updater-native.ts'],
  outdir: frontend,
  target: 'browser',
  minify: true
});
if (!build.success) throw new Error('Fixture build failed');
await writeFile(
  path.join(frontend, 'index.html'),
  '<!doctype html><meta charset="utf-8"><title>SEP Chat updater QA</title><body>Проверка обновления<script type="module" src="./desktop-updater-native.js"></script>'
);
for (const version of ['1.6.100', '1.6.101']) {
  const config = path.join(root, `config-${version}.json`);
  await writeFile(
    config,
    JSON.stringify({
      productName: 'SEP Chat Updater QA',
      identifier: 'ru.pksep.chat.updaterqa',
      version,
      build: {
        beforeBuildCommand: '',
        frontendDist: '../.codex/desktop-updater-native/frontend'
      },
      app: {
        windows: [
          { label: 'main', title: 'SEP Chat: updater QA', visible: false }
        ]
      },
      bundle: { targets: ['nsis'], createUpdaterArtifacts: true },
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
  await mustRun(
    process.execPath,
    ['run', 'tauri', 'build', '--config', config, '--bundles', 'nsis'],
    signingEnv
  );
  const bundles = path.resolve('src-tauri/target/release/bundle/nsis');
  const installer = (await readdir(bundles)).find(
    name => name.includes(version) && name.endsWith('-setup.exe')
  );
  if (!installer) throw new Error('No NSIS installer');
  await copyFile(
    path.join(bundles, installer),
    path.join(root, `${version}.exe`)
  );
  await copyFile(
    path.join(bundles, `${installer}.sig`),
    path.join(root, `${version}.exe.sig`)
  );
}
let goodSignature = false;
let complete!: (value: unknown) => void;
const finished = new Promise(resolve => {
  complete = resolve;
});
const reports: unknown[] = [];
const signature = (
  await readFile(path.join(root, '1.6.101.exe.sig'), 'utf8')
).trim();
// Синтаксически корректная подпись, в которой изменён один байт Ed25519.
const sigLines = Buffer.from(signature, 'base64').toString().split(/\r?\n/);
const signatureBytes = Buffer.from(sigLines[1], 'base64');
signatureBytes[15] ^= 1;
sigLines[1] = signatureBytes.toString('base64');
const badSignature = Buffer.from(sigLines.join('\n')).toString('base64');
const server = Bun.serve({
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
          pub_date: new Date().toISOString(),
          platforms: {
            'windows-x86_64': {
              url: 'http://127.0.0.1:17883/update.exe',
              signature: goodSignature ? signature : badSignature
            }
          }
        },
        { headers }
      );
    if (url.pathname === '/update.exe')
      return new Response(Bun.file(path.join(root, '1.6.101.exe')), {
        headers
      });
    if (url.pathname === '/report') {
      const data = await request.json();
      reports.push(data);
      if (data.stage === 'invalid-signature' && data.rejected)
        goodSignature = true;
      if (data.stage === 'restarted' || data.stage === 'failed') complete(data);
      await writeFile(
        path.join(root, 'reports.json'),
        JSON.stringify(reports, null, 2)
      );
      return new Response(null, { status: 204, headers });
    }
    return new Response(null, { status: 404, headers });
  }
});
const installDirectory = path.join(root, 'installed');
try {
  await mustRun(path.join(root, '1.6.100.exe'), [
    '/S',
    `/D=${installDirectory}`
  ]);
  const child = spawn(path.join(installDirectory, 'sep-chat.exe'), [], {
    windowsHide: true,
    stdio: 'ignore',
    detached: true
  });
  child.unref();
  const timeout = setTimeout(
    () => complete({ stage: 'failed', message: 'Restart timeout' }),
    180_000
  );
  const result = (await finished) as Record<string, unknown>;
  clearTimeout(timeout);
  console.log(JSON.stringify(result));
  if (
    result.stage !== 'restarted' ||
    result.version !== '1.6.101' ||
    result.draft !== 'Несохранённый текст перед обновлением' ||
    result.session !== 'synthetic-session'
  ) {
    throw new Error('Native updater smoke failed');
  }
} finally {
  server.stop(true);
  await mustRun(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Get-CimInstance Win32_Process -Filter "Name = 'sep-chat.exe'" | Where-Object { $_.ExecutablePath -eq $env:SEP_UPDATER_QA_EXECUTABLE } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`
    ],
    {
      ...process.env,
      SEP_UPDATER_QA_EXECUTABLE: path.join(installDirectory, 'sep-chat.exe')
    }
  );
  const uninstaller = path.join(installDirectory, 'uninstall.exe');
  if (await Bun.file(uninstaller).exists()) await mustRun(uninstaller, ['/S']);
  const integrationAfter = await productionIntegration();
  const unchanged =
    JSON.stringify(integrationBefore) === JSON.stringify(integrationAfter);
  await writeFile(
    path.join(root, 'integration-isolation.json'),
    JSON.stringify(
      {
        passed: unchanged,
        protocolPreserved:
          integrationBefore.protocolCommand ===
          integrationAfter.protocolCommand,
        autostartPreserved:
          integrationBefore.autostart === integrationAfter.autostart
      },
      null,
      2
    )
  );
  if (!unchanged)
    throw new Error(
      'Тестовый установщик изменил протокол или автозапуск рабочего клиента'
    );
  console.log(
    JSON.stringify({
      productionProtocolPreserved: true,
      productionAutostartPreserved: true
    })
  );
}
