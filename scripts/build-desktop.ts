import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { writeDesktopConfig } from './desktop-release';

const version = process.env.DESKTOP_VERSION;
const args = process.argv.slice(2);
if (args[0] === '--') args.shift();
const bootstrap = args.includes('--bootstrap');
if (bootstrap) args.splice(args.indexOf('--bootstrap'), 1);
if (!version) throw new Error('Укажите DESKTOP_VERSION — версию выпуска X.Y.Z');
if (
  !bootstrap &&
  !process.env.TAURI_SIGNING_PRIVATE_KEY &&
  !process.env.TAURI_SIGNING_PRIVATE_KEY_PATH
) {
  throw new Error(
    'Нужен ключ подписи TAURI_SIGNING_PRIVATE_KEY или TAURI_SIGNING_PRIVATE_KEY_PATH'
  );
}
const config = '.codex/desktop-release.config.json';
await writeDesktopConfig(config, version);
if (bootstrap) {
  const value = JSON.parse(await readFile(config, 'utf8'));
  value.bundle.createUpdaterArtifacts = false;
  await writeFile(config, JSON.stringify(value));
}
const code = await new Promise<number | null>((resolve, reject) => {
  const child = spawn(
    process.execPath,
    ['run', 'tauri', 'build', '--config', config, ...args],
    { stdio: 'inherit', windowsHide: true }
  );
  child.once('error', reject);
  child.once('exit', resolve);
});
process.exitCode = code ?? 1;
