import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const sidecars = 'src-tauri/binaries';
export const piAgentBundlePath = 'binaries/sep-pi-agent';

export function buildPiSidecar(targetArgs: string[]): string {
  const targetOption = targetArgs.findIndex(
    arg => arg === '--target' || arg === '-t'
  );
  const target =
    (targetOption >= 0 ? targetArgs[targetOption + 1] : undefined) ??
    targetArgs
      .find(arg => arg.startsWith('--target='))
      ?.slice('--target='.length) ??
    execFileSync('rustc', ['-vV'], {
      encoding: 'utf8',
      windowsHide: true
    }).match(/^host: (\S+)/m)?.[1];
  const bunTarget = target
    ?.replace(/^x86_64-/, 'x64-')
    .replace(/^aarch64-/, 'arm64-')
    .replace(/^(\w+)-pc-windows-msvc$/, 'bun-windows-$1')
    .replace(/^(\w+)-apple-darwin$/, 'bun-darwin-$1')
    .replace(/^(\w+)-unknown-linux-gnu$/, 'bun-linux-$1');
  if (!bunTarget?.startsWith('bun-')) {
    throw new Error(
      'Сборка Pi недоступна для платформы ' + (target ?? 'не определена')
    );
  }

  mkdirSync(sidecars, { recursive: true });
  const output = resolve(
    sidecars,
    'sep-pi-agent-' + target + (bunTarget.includes('windows') ? '.exe' : '')
  );
  execFileSync(
    process.execPath,
    [
      'build',
      '--compile',
      '--target=' + bunTarget,
      '--no-compile-autoload-bunfig',
      '--no-compile-autoload-dotenv',
      resolve('scripts/desktop-pi-agent.ts'),
      '--outfile',
      output
    ],
    { cwd: tmpdir(), stdio: 'inherit', windowsHide: true }
  );

  return output;
}
