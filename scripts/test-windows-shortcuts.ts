import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

if (process.platform !== 'win32')
  throw new Error('Проверка ярлыков NSIS запускается только в Windows');

const nsis = [
  process.env.MAKENSIS,
  path.join(process.env.LOCALAPPDATA!, 'tauri/NSIS/makensis.exe'),
  'C:/Program Files (x86)/NSIS/makensis.exe'
].find(file => file && existsSync(file));
if (!nsis) throw new Error('Сначала соберите NSIS-пакет через tauri:build');
const utilities = path.resolve('src-tauri/target/release/nsis/x64');
if (!existsSync(path.join(utilities, 'utils.nsh')))
  throw new Error('Не найдены NSIS-утилиты собранного Tauri-установщика');

const run = (file: string, args: string[]) =>
  new Promise<number>((resolve, reject) => {
    const child = spawn(file, args, {
      windowsHide: true,
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });

const root = await mkdtemp(path.join(tmpdir(), 'sep-chat-shortcuts-'));
try {
  for (const startMenu of ['', 'Chat QA']) {
    const directory = path.join(root, startMenu ? 'folder' : 'direct');
    await mkdir(directory);
    const code = await run(nsis, [
      '/INPUTCHARSET',
      'UTF8',
      '/V2',
      `/DQA_ROOT=${directory}`,
      `/DQA_UTILS=${utilities}`,
      `/DQA_HOOK=${path.resolve('src-tauri/windows/brand-migration.nsh')}`,
      `/DQA_KEY=ShortcutMigrationQA-${randomUUID()}`,
      `/DQA_STARTMENU=${startMenu}`,
      path.resolve('test/fixtures/windows-shortcuts.nsi')
    ]);
    if (code) throw new Error(`Ошибка компиляции NSIS: ${code}`);
    const result = await run(path.join(directory, 'shortcuts.exe'), ['/S']);
    if (result) {
      const reason = await readFile(
        path.join(directory, 'failure.txt'),
        'utf16le'
      ).catch(() => 'Нет отчёта установщика');
      throw new Error(`Проверка ярлыков не пройдена: ${reason}`);
    }
    if ((await readFile(path.join(directory, 'passed.txt'), 'utf8')) !== '8')
      throw new Error('Не все сценарии ярлыков выполнены');
    const ids = await run('powershell.exe', [
      '-NoProfile',
      '-File',
      path.resolve('test/fixtures/windows-shortcut-ids.ps1'),
      '-TestDirectory',
      directory
    ]);
    if (ids)
      throw new Error('Не восстановлен идентификатор уведомлений ярлыка');
    console.log(
      `Пройдено 8 сценариев: меню ${startMenu ? 'с папкой' : 'без папки'}`
    );
  }
} finally {
  const parent = path.resolve(tmpdir());
  if (
    path.dirname(path.resolve(root)) !== parent ||
    !path.basename(root).startsWith('sep-chat-shortcuts-')
  )
    throw new Error(
      'Временный каталог проверки находится вне разрешённого пути'
    );
  await rm(root, { recursive: true, force: true });
}
