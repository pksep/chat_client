import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('test-results-native', 'call-window-preview');
await mkdir(root, { recursive: true });
const origin = 'http://127.0.0.1:5183';
const config = path.join(root, 'tauri.conf.json');
await writeFile(
  config,
  JSON.stringify({
    identifier: 'ru.pksep.chat.callpreview',
    productName: 'СЭП Чат — локальный звонок',
    build: {
      beforeDevCommand: '',
      devUrl: `${origin}/e2e/fixtures/desktop-call-window.html${process.argv.includes('--native-toasts') ? '?nativeToasts=1' : ''}`
    },
    app: {
      appDirectoriesOverride: path.join(root, 'profile'),
      windows: [
        {
          label: 'main',
          create: false,
          title: 'СЭП Чат — локальная проверка',
          decorations: false,
          width: 1000,
          height: 740,
          minHeight: 400
        }
      ]
    },
    plugins: { 'deep-link': { desktop: { schemes: ['sepchat-call-preview'] } } }
  })
);
const reports: unknown[] = [];
const api = Bun.serve({
  hostname: '127.0.0.1',
  port: 5213,
  async fetch(request) {
    if (request.headers.get('origin') !== origin)
      return new Response(null, { status: 403 });
    if (new URL(request.url).pathname !== '/report')
      return Response.json([], {
        headers: { 'Access-Control-Allow-Origin': origin }
      });
    const report = await request.json();
    if (
      process.platform === 'win32' &&
      report.step === 'message-visibility-delivered'
    ) {
      const script = `[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
      $history=[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]::History
      @($history.GetHistory('ru.pksep.chat.callpreview') | Where-Object { $_.Group -eq '4e709627-2338-464f-8cda-ec036b41e815' } | ForEach-Object { @{ tag=$_.Tag; group=$_.Group; xml=$_.Content.GetXml() } }) | ConvertTo-Json -Depth 4`;
      const check = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { windowsHide: true }
      );
      const chunks: Buffer[] = [];
      check.stdout.on('data', data => chunks.push(data));
      await new Promise(resolve => check.once('exit', resolve));
      await writeFile(
        path.join(root, 'windows-message-history.json'),
        Buffer.concat(chunks)
      );
    }
    reports.push(report);
    console.log(JSON.stringify(report));
    await writeFile(
      path.join(root, 'report.json'),
      JSON.stringify(reports, null, 2)
    );
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': origin }
    });
  }
});
const vite = spawn(
  process.execPath,
  ['run', 'vite', '--host', '127.0.0.1', '--port', '5183', '--strictPort'],
  { windowsHide: true, stdio: 'inherit' }
);
let native: ReturnType<typeof spawn> | undefined;
const cleanup = async () => {
  for (const child of [native, vite]) {
    if (!child?.pid || child.exitCode !== null) continue;
    const stop = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore'
    });
    await new Promise(resolve => stop.once('exit', resolve));
  }
  api.stop(true);
};
process.once('SIGINT', () => void cleanup().finally(() => process.exit()));
process.once('SIGTERM', () => void cleanup().finally(() => process.exit()));
try {
  const deadline = Date.now() + 60_000;
  while (true) {
    try {
      if ((await fetch(`${origin}/e2e/fixtures/desktop-call-window.html`)).ok)
        break;
    } catch {
      /* Vite запускается. */
    }
    if (Date.now() > deadline)
      throw new Error('Локальный сервер не запустился');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  native = spawn(
    process.execPath,
    ['run', 'tauri', 'dev', '--no-watch', '--config', config],
    {
      windowsHide: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:
          '--autoplay-policy=no-user-gesture-required'
      }
    }
  );
  console.log(
    JSON.stringify({
      previewPid: process.pid,
      vitePid: vite.pid,
      nativePid: native.pid,
      root
    })
  );
  await new Promise(resolve => native!.once('exit', resolve));
} finally {
  await cleanup();
}
