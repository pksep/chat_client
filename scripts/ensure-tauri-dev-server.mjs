import net from 'node:net';
import { spawn } from 'node:child_process';

const host = process.env.TAURI_DEV_HOST || '127.0.0.1';
const port = Number(process.env.TAURI_DEV_PORT || '5173');
const isWindows = process.platform === 'win32';
const bunCommand = isWindows ? 'bun.cmd' : 'bun';
const hostsToProbe = Array.from(new Set([host, '127.0.0.1', 'localhost']));

const isPortOpen = targetHost =>
  new Promise(resolve => {
    const socket = net.createConnection({ host: targetHost, port });

    socket.on('connect', () => {
      socket.end();
      resolve(true);
    });

    socket.on('error', () => {
      resolve(false);
    });

    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });

for (const targetHost of hostsToProbe) {
  if (await isPortOpen(targetHost)) {
    console.log(
      `Tauri will reuse the existing dev server at http://${targetHost}:${port}.`
    );
    process.exit(0);
  }
}

console.log(`Starting Vite dev server for Tauri at http://${host}:${port}...`);

const child = isWindows
  ? spawn(`${bunCommand} run start:dev`, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        BROWSER: 'none'
      }
    })
  : spawn(bunCommand, ['run', 'start:dev'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        BROWSER: 'none'
      }
    });

child.stdout?.on('data', chunk => {
  process.stdout.write(chunk);
});

child.stderr?.on('data', chunk => {
  process.stderr.write(chunk);
});

child.on('error', error => {
  console.error('Failed to start the Tauri dev server helper:', error);
  process.exit(1);
});

const shutdownChild = signal => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on('SIGINT', () => shutdownChild('SIGINT'));
process.on('SIGTERM', () => shutdownChild('SIGTERM'));

child.on('exit', code => {
  process.exit(code ?? 0);
});
