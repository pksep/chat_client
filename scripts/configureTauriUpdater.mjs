import { readFile, writeFile } from 'node:fs/promises';

const pubkey = process.env.TAURI_UPDATER_PUBKEY;

if (!pubkey) {
  throw new Error('TAURI_UPDATER_PUBKEY is required');
}

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
