import assert from 'node:assert/strict';
import { execFile, fork, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer as createTcpServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  fetchWithTimeout,
  readLokiEvents
} from './telemetry-local/loki-query.mjs';

const execute = promisify(execFile);
const clientDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = resolve(clientDir, '../chat_server');
const runId = `telemetry-local-${Date.now()}-${randomUUID().slice(0, 8)}`;
const outputDir = join(clientDir, 'test-results/telemetry-local', runId);
const containerName = runId;
const volumeName = `${runId}-data`;
const token = randomUUID();
const report = {
  runId,
  status: 'running',
  startedAt: new Date().toISOString()
};
let server;
let browserRun;
let vite;
let volumeCreated = false;
let containerCreated = false;
let interrupted = false;
await mkdir(outputDir, { recursive: true });
const serverLog = createWriteStream(join(outputDir, 'server.log'));
const writeReport = () =>
  writeFile(join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
await writeReport();

async function docker(...args) {
  return (
    await execute('docker', args, { maxBuffer: 8 * 1024 * 1024 })
  ).stdout.trim();
}

async function freeLocalPort() {
  const socket = createTcpServer();
  await new Promise((resolvePort, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolvePort);
  });
  const { port } = socket.address();
  await new Promise((resolveClose, reject) =>
    socket.close(error => (error ? reject(error) : resolveClose()))
  );
  return port;
}

async function waitFor(check, description, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  do {
    if (interrupted) throw new Error('Проверка прервана');
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  } while (Date.now() < deadline);
  throw new Error(`${description}: превышено время ожидания`, {
    cause: lastError
  });
}

async function startServer(lokiUrl) {
  server = fork(join(serverDir, 'test/telemetry-local/server.ts'), [], {
    execPath: process.execPath,
    execArgv: [
      '-r',
      join(serverDir, 'node_modules/ts-node/register/transpile-only'),
      '-r',
      join(serverDir, 'node_modules/tsconfig-paths/register')
    ],
    cwd: serverDir,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      TELEMETRY_LOCAL_LOKI_URL: lokiUrl,
      TELEMETRY_LOCAL_RUN_ID: runId,
      TELEMETRY_LOCAL_TOKEN: token
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  server.stdout.pipe(serverLog, { end: false });
  server.stderr.pipe(serverLog, { end: false });
  return new Promise((resolveServer, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Локальный сервер не запустился; см. server.log')),
      30_000
    );
    const finish = error => {
      clearTimeout(timeout);
      server.off('exit', onExit);
      server.off('error', onError);
      server.off('message', onMessage);
      if (error) reject(error);
    };
    const onExit = code =>
      finish(new Error(`Сервер завершился (${code}); см. server.log`));
    const onError = error => finish(error);
    const onMessage = message => {
      if (message?.url) {
        finish();
        resolveServer(message.url);
      }
    };
    server.once('exit', onExit);
    server.once('error', onError);
    server.on('message', onMessage);
  });
}

process.on('SIGINT', () => {
  interrupted = true;
  browserRun?.kill('SIGTERM');
});

try {
  console.log('Запускаю изолированный Loki с дисковым томом (нужен Docker)…');
  await docker('info', '--format', '{{.ServerVersion}}');
  await docker(
    'volume',
    'create',
    '--label',
    'chat.telemetry.local=true',
    volumeName
  );
  volumeCreated = true;
  await docker(
    'create',
    '--name',
    containerName,
    '--label',
    'chat.telemetry.local=true',
    '--publish',
    `127.0.0.1:${await freeLocalPort()}:3100`,
    '--mount',
    `type=volume,source=${volumeName},target=/loki`,
    '--mount',
    `type=bind,source=${join(serverDir, 'test/telemetry-local/loki.yaml')},target=/etc/loki/telemetry-local.yaml,readonly`,
    'grafana/loki:3.5.0',
    '-config.file=/etc/loki/telemetry-local.yaml'
  );
  containerCreated = true;
  await docker('start', containerName);
  const binding = await waitFor(
    () => docker('port', containerName, '3100/tcp'),
    'Публикация порта Loki',
    10_000
  );
  const lokiUrl = `http://${binding}`;
  const ready = async () =>
    (await fetchWithTimeout(`${lokiUrl}/ready`, {}, 2000)).ok;
  await waitFor(ready, 'Готовность Loki');
  const apiUrl = await startServer(lokiUrl);
  const { createServer } = await import('vite');
  vite = await createServer({
    root: clientDir,
    cacheDir: join(clientDir, 'node_modules/.vite-telemetry-local'),
    server: {
      host: '127.0.0.1',
      port: await freeLocalPort(),
      strictPort: true,
      open: false,
      watch: { ignored: ['**/test-results/**', '**/playwright-report/**'] },
      proxy: {
        '/telemetry-local-api': {
          target: apiUrl,
          rewrite: path => path.replace(/^\/telemetry-local-api/, '')
        }
      }
    }
  });
  await vite.listen();
  const clientUrl = vite.resolvedUrls.local[0].replace(/\/$/, '');
  console.log(`Клиент: ${clientUrl}; API: ${apiUrl}`);
  console.log('Проверяю клиент → настоящий HTTP API → Loki…');
  browserRun = spawn(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      '--config',
      'playwright.telemetry-local.config.ts'
    ],
    {
      cwd: clientDir,
      env: {
        ...process.env,
        TELEMETRY_LOCAL_API_URL: `${clientUrl}/telemetry-local-api`,
        TELEMETRY_LOCAL_LOKI_URL: lokiUrl,
        TELEMETRY_LOCAL_RUN_ID: runId,
        TELEMETRY_LOCAL_TOKEN: token,
        TELEMETRY_LOCAL_OUTPUT_DIR: outputDir,
        TELEMETRY_LOCAL_CLIENT_URL: clientUrl
      },
      stdio: 'inherit'
    }
  );
  const code = await new Promise((resolveExit, reject) => {
    browserRun.once('error', reject);
    browserRun.once('exit', resolveExit);
  });
  assert.equal(code, 0, 'Браузерная проверка не прошла');
  const beforeRestart = await readLokiEvents(lokiUrl, runId);
  assert.ok(beforeRestart.length > 0, 'В Loki нет событий');
  await writeFile(
    join(outputDir, 'events-before-restart.jsonl'),
    beforeRestart.map(event => JSON.stringify(event)).join('\n') + '\n'
  );

  console.log(
    'Проверяю отказ хранилища и сохранность записей после перезапуска Loki…'
  );
  await docker('stop', '--time', '20', containerName);
  const probeId = randomUUID();
  const response = await fetchWithTimeout(`${apiUrl}/telemetry/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      events: [
        {
          id: probeId,
          name: 'app.telemetry_local.storage_unavailable',
          category: 'app',
          occurredAt: new Date().toISOString()
        }
      ]
    })
  });
  assert.ok(response.ok);
  const acknowledgement = await response.json();
  assert.equal(acknowledgement.accepted, 1);
  await docker('start', containerName);
  await waitFor(ready, 'Готовность Loki после перезапуска');
  const restored = await waitFor(async () => {
    const events = await readLokiEvents(lokiUrl, runId);
    return beforeRestart.every(saved =>
      events.some(event => event.id === saved.id)
    )
      ? events
      : null;
  }, 'Восстановление событий из дискового тома');
  const restoredById = new Map(restored.map(event => [event.id, event]));
  for (const event of beforeRestart)
    assert.deepEqual(restoredById.get(event.id), event);
  assert.ok(
    !restoredById.has(probeId),
    'Проба при остановленном Loki не должна сохраниться'
  );
  await writeFile(
    join(outputDir, 'events.jsonl'),
    restored.map(event => JSON.stringify(event)).join('\n') + '\n'
  );
  Object.assign(report, {
    status: 'passed',
    eventCount: restored.length,
    storageRestartVerified: true,
    unavailableStorageProbe: {
      accepted: acknowledgement.accepted,
      stored: false
    },
    fixtures: {
      ip: '81.2.69.142 (тестовый forwarded IP)',
      coordinates: '40.18, 44.51 (эмуляция браузера)',
      android: 'эмуляция RuStore bridge'
    }
  });
  console.log(
    `Сохранение подтверждено: ${restored.length} событий прочитаны после перезапуска.`
  );
} catch (error) {
  Object.assign(report, {
    status: 'failed',
    error: error.stack || String(error)
  });
  console.error(error);
  process.exitCode = 1;
} finally {
  if (server?.pid && server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise(resolveExit =>
      server.once('exit', resolveExit)
    );
    if (server.connected) server.disconnect();
    const timeout = setTimeout(() => server.kill('SIGKILL'), 5000);
    await stopped;
    clearTimeout(timeout);
  }
  serverLog.end();
  await vite?.close();
  if (containerCreated) {
    try {
      await writeFile(
        join(outputDir, 'loki.log'),
        await execute('docker', ['logs', containerName]).then(
          result => result.stdout + result.stderr
        )
      );
    } catch {
      /* Диагностика не должна мешать удалению тестового контейнера. */
    }
    await docker('rm', '--force', containerName).catch(error =>
      console.error(error.message)
    );
  }
  if (volumeCreated) {
    await docker('volume', 'rm', volumeName).catch(error =>
      console.error(error.message)
    );
  }
  report.finishedAt = new Date().toISOString();
  await writeReport();
  console.log(`Отчёт и сохранённые события: ${outputDir}`);
}
