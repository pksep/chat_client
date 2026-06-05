import { readFile, writeFile } from 'node:fs/promises';

const nextVersion = process.argv[2]?.replace(/^v/, '');

if (!nextVersion || !/^\d+\.\d+\.\d+$/.test(nextVersion)) {
  throw new Error(
    'Usage: node scripts/setDesktopVersion.mjs <major.minor.patch|vmajor.minor.patch>'
  );
}

const updateJsonVersion = async filePath => {
  const payload = JSON.parse(await readFile(filePath, 'utf8'));
  payload.version = nextVersion;
  await writeFile(`${filePath}`, `${JSON.stringify(payload, null, 2)}\n`);
};

const updateCargoVersion = async filePath => {
  const source = await readFile(filePath, 'utf8');
  const updated = source.replace(
    /^version = ".*"$/m,
    `version = "${nextVersion}"`
  );

  if (updated === source) {
    throw new Error(`Failed to update version in ${filePath}`);
  }

  await writeFile(filePath, updated);
};

await updateJsonVersion('src-tauri/tauri.conf.json');
await updateCargoVersion('src-tauri/Cargo.toml');

console.log(`Desktop version set to ${nextVersion}`);
