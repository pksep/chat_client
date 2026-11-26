import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  copyFile,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  rmdir,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';

if (process.platform !== 'win32')
  throw new Error('Проверка установщика агента требует Windows');
const nsis = [
  process.env.MAKENSIS,
  path.join(process.env.LOCALAPPDATA!, 'tauri/NSIS/makensis.exe')
].find(file => file && existsSync(file));
if (!nsis) throw new Error('Не найден компилятор NSIS');
const qaParent = path.resolve('.codex/agent-installer-lock-qa');
await mkdir(qaParent, { recursive: true });
const root = await mkdtemp(path.join(qaParent, 'run-'));
assert.equal(path.dirname(root), qaParent);
const run = async (file: string, args: string[], capture = false) => {
  const child = spawn(file, args, {
    windowsHide: true,
    stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit']
  });
  const chunks: Buffer[] = [];
  child.stdout?.on('data', data => chunks.push(data));
  const code = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
  assert.equal(code, 0, `${path.basename(file)}: ${code}`);
  return Buffer.concat(chunks);
};
const helper = path.join(root, 'helper.exe');
await run('rustc', [
  '--edition=2021',
  'test/fixtures/agent-lock-helper.rs',
  '-o',
  helper
]);
const installed = path.join(root, 'installed');
const unrelated = path.join(root, 'unrelated');
await mkdir(installed);
await mkdir(unrelated);
const target = path.join(installed, 'sep-pi-agent.exe');
const other = path.join(unrelated, 'sep-pi-agent.exe');
await copyFile(helper, target);
await copyFile(helper, other);
const replacement = path.join(root, 'replacement.txt');
await writeFile(replacement, 'QA new agent payload');
const baselineHook = path.resolve(
  'test/fixtures/windows-agent-lock-baseline.nsh'
);
const compile = async (hook: string, name: string) => {
  const output = path.join(root, name + '.exe');
  await run(nsis, [
    '/INPUTCHARSET',
    'UTF8',
    '/V2',
    `/DQA_HOOK=${hook}`,
    `/DQA_OUTPUT=${output}`,
    `/DQA_INSTALL=${installed}`,
    `/DQA_REPLACEMENT=${replacement}`,
    path.resolve('test/fixtures/windows-agent-lock.nsi')
  ]);
  return output;
};
const baseline = await compile(baselineHook, 'baseline-installer');
const fixed = await compile(
  path.resolve('src-tauri/windows/brand-migration.nsh'),
  'fixed-installer'
);
const processes = [target, other].map(executable =>
  spawn(executable, [], { windowsHide: true, stdio: 'ignore' })
);
try {
  const locked = async (file: string) => {
    try {
      const handle = await open(file, 'r+');
      await handle.close();
      return false;
    } catch (error) {
      if (
        !['EPERM', 'EACCES', 'EBUSY'].includes(
          (error as NodeJS.ErrnoException).code ?? ''
        )
      )
        throw error;
      return true;
    }
  };
  assert(
    await locked(target),
    'Тестовый агент должен удерживать установленный exe'
  );
  await run(baseline, ['/S']);
  assert.notEqual(
    (await readFile(target)).toString(),
    'QA new agent payload',
    'Старый установщик должен воспроизвести блокировку файла'
  );
  assert.equal(processes[0].exitCode, null);
  console.log(
    'PASS: baseline installer cannot replace running sep-pi-agent.exe'
  );
  await run(fixed, ['/S']);
  assert.equal((await readFile(target)).toString(), 'QA new agent payload');
  assert.equal(
    processes[1].exitCode,
    null,
    'Процесс с таким же именем из другой папки должен остаться'
  );
  assert(await locked(other));
  console.log(
    'PASS: new installer releases only its own installed agent and writes replacement'
  );
} finally {
  for (const child of processes) {
    if (child.exitCode === null) child.kill();
    if (child.exitCode === null)
      await new Promise<void>(resolve => child.once('exit', () => resolve()));
  }
  for (const file of [
    target,
    other,
    helper,
    path.join(root, 'helper.pdb'),
    replacement,
    baseline,
    fixed
  ]) {
    assert(path.resolve(file).startsWith(root + path.sep));
    await rm(file, { force: true });
  }
  for (const directory of [installed, unrelated, root]) await rmdir(directory);
}
