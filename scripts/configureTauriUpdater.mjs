import { readFile, writeFile } from 'node:fs/promises';

const rawPubkey = process.env.TAURI_UPDATER_PUBKEY;

if (!rawPubkey) {
  throw new Error('TAURI_UPDATER_PUBKEY is required');
}

const normalizePubkey = value => {
  const trimmedValue = value.trim();
  const directLines = trimmedValue
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (
    directLines.length === 1 &&
    !directLines[0].startsWith('untrusted comment:')
  ) {
    return directLines[0];
  }

  if (directLines.length > 1) {
    return directLines.find(line => !line.startsWith('untrusted comment:'));
  }

  try {
    const decoded = Buffer.from(trimmedValue, 'base64').toString('utf8');

    if (!decoded.includes('untrusted comment:')) {
      return trimmedValue;
    }

    const decodedLines = decoded
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
    const decodedPubkey = decodedLines.find(
      line => !line.startsWith('untrusted comment:')
    );

    return decodedPubkey || trimmedValue;
  } catch {
    return trimmedValue;
  }
};

const pubkey = normalizePubkey(rawPubkey);

const configPath = 'src-tauri/tauri.conf.json';
const config = JSON.parse(await readFile(configPath, 'utf8'));

config.bundle = {
  ...config.bundle,
  createUpdaterArtifacts: true
};

config.plugins = {
  ...config.plugins,
  updater: {
    pubkey,
    endpoints: [
      'https://github.com/pksep/chat_client/releases/latest/download/latest.json'
    ]
  }
};

await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

console.log('Tauri updater config injected');
