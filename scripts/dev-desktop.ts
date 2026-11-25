import { spawn } from 'node:child_process';
import { buildPiSidecar } from './build-pi-sidecar';

const args = process.argv.slice(2);
if (args[0] === '--') args.shift();

const child = spawn(process.execPath, ['run', 'tauri', 'dev', ...args], {
  env: { ...process.env, SEP_CHAT_PI_BIN: buildPiSidecar(args) },
  stdio: 'inherit',
  windowsHide: true
});

child.on('exit', (code): void => {
  process.exitCode = code ?? 1;
});
child.on('error', (error): void => {
  console.error(error.message);
  process.exitCode = 1;
});
