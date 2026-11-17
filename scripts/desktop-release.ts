import { createHash, createPublicKey, verify } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  copyFile,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';

export const releaseVersion = (value: string) => {
  const version = value.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(version)) {
    throw new Error('Нужна версия X.Y.Z или X.Y.Z-beta.N');
  }
  return version;
};

export const releaseChannel = (version: string) =>
  releaseVersion(version).includes('-beta.') ? 'beta' : 'stable';

export const desktopUpdateEndpoint = (channel: 'stable' | 'beta'): string =>
  `https://github.com/pksep/chat_client/releases/download/desktop-${channel}/latest.json`;

export const desktopReleaseAssetName = (target: string, file: string): string =>
  `${target}-${path.basename(file)}`.replace(/\s+/g, '-');

export const normalizeUpdaterPublicKey = (input: string) => {
  const trimmed = input.trim();
  const decoded = Buffer.from(trimmed, 'base64');
  const text = trimmed.startsWith('untrusted comment:')
    ? trimmed
    : decoded.toString('utf8');
  const line = text.startsWith('untrusted comment:')
    ? text.split(/\r?\n/)[1]
    : trimmed;
  const raw = Buffer.from(line ?? '', 'base64');
  if (raw.length !== 42 || raw.subarray(0, 2).toString() !== 'Ed') {
    throw new Error('Некорректный TAURI_UPDATER_PUBKEY');
  }
  return Buffer.from(
    `untrusted comment: SEP Chat updater public key\n${raw.toString('base64')}\n`
  ).toString('base64');
};

export async function writeDesktopConfig(output: string, version: string) {
  const base = JSON.parse(await readFile('src-tauri/tauri.conf.json', 'utf8'));
  const committedKey = normalizeUpdaterPublicKey(base.plugins.updater.pubkey);
  const pubkey = process.env.TAURI_UPDATER_PUBKEY?.trim()
    ? normalizeUpdaterPublicKey(process.env.TAURI_UPDATER_PUBKEY)
    : committedKey;
  if (pubkey !== committedKey)
    throw new Error(
      'Ключ CI отличается от ключа существующих desktop-клиентов'
    );
  const channel = releaseChannel(version);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(
    output,
    JSON.stringify(
      {
        version: releaseVersion(version),
        bundle: { createUpdaterArtifacts: true },
        plugins: {
          updater: {
            pubkey,
            endpoints: [desktopUpdateEndpoint(channel)],
            windows: { installMode: 'passive' }
          }
        }
      },
      null,
      2
    )
  );
}

const walk = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(entry => {
        const fullPath = path.join(directory, entry.name);
        return entry.isDirectory()
          ? walk(fullPath)
          : Promise.resolve([fullPath]);
      })
    )
  ).flat();
};

export const updaterFileFor = (target: string, names: string[]) => {
  const suffix: Record<string, string> = {
    'windows-x86_64': '-setup.exe',
    'linux-x86_64': '.AppImage',
    'darwin-aarch64': '.app.tar.gz',
    'darwin-x86_64': '.app.tar.gz'
  };
  if (!suffix[target]) throw new Error(`Неизвестная платформа: ${target}`);
  const matches = names.filter(name => name.endsWith(suffix[target]));
  if (matches.length !== 1)
    throw new Error(`Нужен ровно один пакет обновления для ${target}`);
  return matches[0];
};

export async function verifyDesktopArtifact(
  file: string,
  signature: string,
  pubkey: string
) {
  const keyLines = Buffer.from(normalizeUpdaterPublicKey(pubkey), 'base64')
    .toString('utf8')
    .trim()
    .split(/\r?\n/);
  const lines = Buffer.from(signature.trim(), 'base64')
    .toString('utf8')
    .trim()
    .split(/\r?\n/);
  const key = Buffer.from(keyLines[1] ?? '', 'base64');
  const signed = Buffer.from(lines[1] ?? '', 'base64');
  if (
    key.length !== 42 ||
    signed.length !== 74 ||
    !lines[2]?.startsWith('trusted comment: ')
  ) {
    throw new Error('Некорректный ключ или подпись обновления');
  }
  if (!key.subarray(2, 10).equals(signed.subarray(2, 10)))
    throw new Error('Пакет подписан другим ключом');
  const publicKey = createPublicKey({
    key: Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      key.subarray(10)
    ]),
    format: 'der',
    type: 'spki'
  });
  const data = await readFile(file);
  const algorithm = signed.subarray(0, 2).toString();
  if (algorithm !== 'Ed' && algorithm !== 'ED')
    throw new Error('Неизвестный алгоритм подписи');
  const message =
    algorithm === 'ED' ? createHash('blake2b512').update(data).digest() : data;
  if (
    !verify(null, message, publicKey, signed.subarray(10)) ||
    !verify(
      null,
      Buffer.concat([signed.subarray(10), Buffer.from(lines[2].slice(17))]),
      publicKey,
      Buffer.from(lines[3] ?? '', 'base64')
    )
  ) {
    throw new Error('Подпись пакета не прошла проверку');
  }
}

export async function collectDesktopArtifacts(
  root: string,
  output: string,
  target: string
) {
  const files = (await walk(root)).filter(file =>
    /\.(exe|msi|AppImage|deb|rpm|dmg|app\.tar\.gz)(\.sig)?$/.test(file)
  );
  const update = updaterFileFor(
    target,
    files.filter(file => !file.endsWith('.sig'))
  );
  const signature = (await readFile(`${update}.sig`, 'utf8')).trim();
  if (!signature) throw new Error('Отсутствует подпись пакета');
  const pubkey = process.env.TAURI_UPDATER_PUBKEY;
  if (!pubkey)
    throw new Error('Нужен TAURI_UPDATER_PUBKEY для проверки пакета');
  await verifyDesktopArtifact(update, signature, pubkey);
  const destination = path.join(output, target);
  await mkdir(destination, { recursive: true });
  for (const file of files)
    await copyFile(file, path.join(destination, path.basename(file)));
}

export async function createDesktopManifest(
  root: string,
  output: string,
  inputVersion: string
) {
  const version = releaseVersion(inputVersion);
  const channel = releaseChannel(version);
  const platforms: Record<string, { url: string; signature: string }> = {};
  const checksums: Record<string, string> = {};
  for (const target of [
    'windows-x86_64',
    'linux-x86_64',
    'darwin-aarch64',
    'darwin-x86_64'
  ]) {
    const directory = path.join(root, target);
    const names = await readdir(directory);
    const file = updaterFileFor(target, names);
    const signature = (
      await readFile(path.join(directory, `${file}.sig`), 'utf8')
    ).trim();
    const decoded = Buffer.from(signature, 'base64').toString('utf8');
    if (!decoded.startsWith('untrusted comment:'))
      throw new Error(`Некорректная подпись ${target}`);
    platforms[target] = {
      url: `https://github.com/pksep/chat_client/releases/download/v${version}/${encodeURIComponent(desktopReleaseAssetName(target, file))}`,
      signature
    };
    for (const name of names) {
      checksums[`${target}/${name}`] = createHash('sha256')
        .update(await readFile(path.join(directory, name)))
        .digest('hex');
    }
  }
  const manifest = {
    version,
    notes: process.env.DESKTOP_RELEASE_NOTES || `SEP Chat ${version}`,
    pub_date: new Date().toISOString(),
    platforms
  };
  await mkdir(path.join(output, channel), { recursive: true });
  await writeFile(
    path.join(output, channel, 'latest.json'),
    JSON.stringify(manifest, null, 2)
  );
  await writeFile(
    path.join(output, 'checksums.json'),
    JSON.stringify(checksums, null, 2)
  );
  return manifest;
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'config') await writeDesktopConfig(args[0], args[1]);
  else if (command === 'collect')
    await collectDesktopArtifacts(args[0], args[1], args[2]);
  else if (command === 'manifest')
    await createDesktopManifest(args[0], args[1], args[2]);
  else throw new Error('Используйте config, collect или manifest');
}
