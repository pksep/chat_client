import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

// Тесты подменяют браузерные globals: каждому файлу нужен отдельный процесс.
const files = (
  await Promise.all(
    ['test', 'tests'].map(async directory =>
      (await readdir(directory))
        .filter(file => /\.(test|spec)\.ts$/.test(file))
        .map(file => `./${directory}/${file}`)
    )
  )
)
  .flat()
  .sort();
let failed = 0;
for (const file of files) {
  const code = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(process.execPath, ['test', file], {
      stdio: 'inherit',
      windowsHide: true
    });
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (code !== 0) failed++;
}
console.log(`Файлов: ${files.length}, ошибок: ${failed}`);
process.exitCode = failed ? 1 : 0;
