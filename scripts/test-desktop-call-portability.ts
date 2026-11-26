import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const origin = 'http://127.0.0.1:5184';
const fixture =
  process.env.CHAT_NATIVE_UI === '1'
    ? 'desktop-ui-regressions'
    : 'desktop-call-portability';
const root = path.resolve(
  'test-results-native',
  `call-portability-${process.platform}-${process.arch}`
);
await mkdir(root, { recursive: true });
const config = path.join(root, 'tauri.conf.json');
const viteConfig = path.join(root, 'vite.config.ts');
await writeFile(
  viteConfig,
  `import { defineConfig, mergeConfig } from 'vite';
import base from '../../vite.config';
export default defineConfig(async env => mergeConfig(
  await (typeof base === 'function' ? base(env) : base),
  { cacheDir: ${JSON.stringify(path.join(root, 'vite-cache'))} }
));`
);
await writeFile(
  config,
  JSON.stringify({
    identifier: 'ru.pksep.chat.callportabilityqa',
    productName: 'СЭП Чат — проверка окна',
    build: {
      beforeDevCommand: '',
      devUrl: `${origin}/e2e/fixtures/${fixture}.html`
    },
    app: {
      appDirectoriesOverride: path.join(root, 'profile'),
      windows: [
        {
          label: 'main',
          create: false,
          title: 'Проверка окна звонка',
          decorations: false,
          width: 1000,
          height: 740
        }
      ]
    },
    plugins: {
      'deep-link': { desktop: { schemes: ['sepchat-call-portability-qa'] } }
    }
  })
);
const reports: Record<string, unknown>[] = [];
let finish!: (passed: boolean) => void;
const completed = new Promise<boolean>(resolve => {
  finish = resolve;
});
const api = Bun.serve({
  hostname: '127.0.0.1',
  port: 5213,
  async fetch(request) {
    const headers = { 'Access-Control-Allow-Origin': origin };
    if (
      request.method !== 'POST' ||
      request.headers.get('origin') !== origin ||
      new URL(request.url).pathname !== '/report'
    )
      return new Response(null, { status: 403 });
    const report = await request.json();
    reports.push(report);
    console.log(JSON.stringify(report));
    if (report.step === 'native-grid' && process.platform === 'darwin') {
      try {
        execFileSync('/usr/sbin/screencapture', [
          '-x',
          path.join(root, 'native-call.png')
        ]);
      } catch (error) {
        console.log(
          JSON.stringify({
            step: 'screenshot-unavailable',
            error: String(error)
          })
        );
      }
    }
    if (
      report.step === 'pin-observed' &&
      process.platform === 'linux' &&
      process.env.GDK_BACKEND === 'x11'
    ) {
      try {
        const windows = execFileSync('wmctrl', ['-l'], { encoding: 'utf8' });
        for (const line of windows.trim().split('\n')) {
          const id = line.split(/\s+/)[0];
          if (/^0x[0-9a-f]+$/i.test(id))
            console.log(
              JSON.stringify({
                step: 'x11-state',
                window: line,
                state: execFileSync(
                  'xprop',
                  ['-id', id, '_NET_WM_STATE', '_NET_WM_WINDOW_TYPE'],
                  { encoding: 'utf8' }
                )
              })
            );
        }
      } catch (error) {
        console.log(String(error));
      }
    }
    await writeFile(
      path.join(root, 'report.json'),
      JSON.stringify(reports, null, 2)
    );
    if (report.passed === false || report.step === 'complete')
      finish(report.passed === true);
    return new Response(null, { status: 204, headers });
  }
});
const children: ChildProcess[] = [];
const launch = (
  args: string[],
  env = process.env,
  executable = process.execPath,
  cwd = process.cwd()
) => {
  const child = spawn(executable, args, {
    cwd,
    windowsHide: true,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
    env
  });
  children.push(child);
  return child;
};
const stop = async () => {
  for (const child of children.reverse()) {
    if (!child.pid || child.exitCode !== null) continue;
    if (process.platform === 'win32') {
      const kill = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore'
      });
      await new Promise(resolve => kill.once('exit', resolve));
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        /* Уже завершён. */
      }
    }
  }
  api.stop(true);
};
process.once('SIGINT', () => void stop().finally(() => process.exit(1)));
process.once('SIGTERM', () => void stop().finally(() => process.exit(1)));
let timer: ReturnType<typeof setTimeout> | undefined;
try {
  const vite = launch([
    'run',
    'vite',
    '--config',
    viteConfig,
    '--host',
    '127.0.0.1',
    '--port',
    '5184',
    '--strictPort'
  ]);
  const ready = Date.now() + 60_000;
  while (true) {
    if (vite.exitCode !== null) throw new Error('Vite завершился до запуска');
    try {
      if ((await fetch(`${origin}/e2e/fixtures/${fixture}.html`)).ok) break;
    } catch {
      /* Запуск Vite. */
    }
    if (Date.now() >= ready) throw new Error('Не запустился Vite');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  const nativeEnv = {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:
      '--autoplay-policy=no-user-gesture-required'
  };
  let native: ChildProcess;
  if (
    process.platform === 'linux' &&
    process.env.CHAT_CALL_NATIVE_TRACE === '1'
  ) {
    const buildEnv = {
      ...nativeEnv,
      TAURI_CONFIG: await readFile(config, 'utf8')
    };
    const build = launch(
      ['build', '--no-default-features'],
      buildEnv,
      'cargo',
      path.resolve('src-tauri')
    );
    const code = await new Promise(resolve => build.once('exit', resolve));
    if (code !== 0) throw new Error('Не собрался диагностический бинарник');
    native = launch(
      [
        '--batch',
        '-ex',
        'set pagination off',
        '-ex',
        'set confirm off',
        '-ex',
        'set debuginfod enabled off',
        '-ex',
        'handle SIGPIPE nostop noprint pass',
        '-ex',
        'handle SIGUSR1 nostop noprint pass',
        '-ex',
        'handle SIGUSR2 nostop noprint pass',
        '-ex',
        'catch syscall exit_group',
        '-ex',
        'run',
        '-ex',
        'thread apply all bt',
        '-ex',
        'info proc mappings',
        '-ex',
        'info registers',
        '-ex',
        'x/12i $pc-24',
        '-ex',
        'continue',
        '--args',
        path.resolve('src-tauri/target/debug/sep-chat')
      ],
      buildEnv,
      'gdb'
    );
  } else {
    native = launch(
      ['run', 'tauri', 'dev', '--no-watch', '--config', config],
      nativeEnv
    );
  }
  native.once('exit', (code, signal) => {
    console.log(JSON.stringify({ step: 'native-exit', code, signal }));
    finish(false);
  });
  await writeFile(
    path.join(root, 'pids.json'),
    JSON.stringify({
      launcher: process.pid,
      native: native.pid,
      vite: children[0].pid
    })
  );
  const passed = await Promise.race([
    completed,
    new Promise<boolean>(resolve => {
      timer = setTimeout(() => resolve(false), 900_000);
    })
  ]);
  if (!passed) throw new Error('Нативная проверка окна не завершилась успешно');
} finally {
  if (timer) clearTimeout(timer);
  await stop();
}
