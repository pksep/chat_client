import { expect, test } from 'bun:test';
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign
} from 'node:crypto';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createDesktopManifest,
  releaseVersion,
  updaterFileFor,
  verifyDesktopArtifact
} from '../scripts/desktop-release';

test('иконки Tauri совместимы с ICNS: RGBA8 и корректная retina-плотность', async () => {
  const configUrl = new URL('../src-tauri/tauri.conf.json', import.meta.url);
  const config = await Bun.file(configUrl).json();
  const pngIcons = (config.bundle.icon as string[]).filter(icon =>
    icon.endsWith('.png')
  );
  expect(pngIcons.length).toBeGreaterThan(0);
  for (const icon of pngIcons) {
    const bytes = Buffer.from(
      await Bun.file(new URL(icon, configUrl)).arrayBuffer()
    );
    expect([...bytes.subarray(0, 8)]).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10
    ]);
    expect(bytes[24], `${icon}: 8-битные каналы`).toBe(8);
    expect(bytes[25], `${icon}: RGBA`).toBe(6);
    const width = bytes.readUInt32BE(16);
    expect(bytes.readUInt32BE(20)).toBe(width);
    const sizes = icon.includes('@2x')
      ? [32, 64, 256, 512, 1024]
      : [16, 32, 128, 256, 512];
    expect(sizes, `${icon}: допустимый размер ICNS`).toContain(width);
  }
});

test('версии, prerelease и выбор правильного пакета для обновлений', () => {
  expect(releaseVersion('v1.48.7')).toBe('1.48.7');
  expect(releaseVersion('v1.49.0-beta.1')).toBe('1.49.0-beta.1');
  for (const invalid of ['main', '../1.2.3', 'v1.2.3;rm', '1.2'])
    expect(() => releaseVersion(invalid)).toThrow();
  expect(
    updaterFileFor('windows-x86_64', [
      'Chat.msi',
      'Chat-setup.exe',
      'Chat-setup.exe.sig'
    ])
  ).toBe('Chat-setup.exe');
  expect(() => updaterFileFor('linux-x86_64', ['Chat.deb'])).toThrow();
  expect(() =>
    updaterFileFor('windows-x86_64', ['A-setup.exe', 'B-setup.exe'])
  ).toThrow();
});

test('подлинная криптографическая проверка Minisign: чужой ключ и изменение байтов отклоняются', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'sep-updater-signature-')
  );
  try {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const keyId = randomBytes(8);
    const rawKey = Buffer.concat([
      Buffer.from('Ed'),
      keyId,
      publicKey.export({ type: 'spki', format: 'der' }).subarray(-32)
    ]);
    const pubkey = Buffer.from(
      `untrusted comment: test\n${rawKey.toString('base64')}\n`
    ).toString('base64');
    const data = Buffer.from('Signed update package');
    const signatureBytes = sign(
      null,
      createHash('blake2b512').update(data).digest(),
      privateKey
    );
    const comment = 'test fixture';
    const global = sign(
      null,
      Buffer.concat([signatureBytes, Buffer.from(comment)]),
      privateKey
    );
    const signature = Buffer.from(
      `untrusted comment: test\n${Buffer.concat([Buffer.from('ED'), keyId, signatureBytes]).toString('base64')}\ntrusted comment: ${comment}\n${global.toString('base64')}\n`
    ).toString('base64');
    const file = path.join(directory, 'package.exe');
    await writeFile(file, data);
    await verifyDesktopArtifact(file, signature, pubkey);
    await writeFile(file, Buffer.from('Tampered update package'));
    await expect(
      verifyDesktopArtifact(file, signature, pubkey)
    ).rejects.toThrow('Подпись');
    const wrong = Buffer.from(rawKey);
    wrong[2] ^= 1;
    const wrongKey = Buffer.from(
      `untrusted comment: test\n${wrong.toString('base64')}\n`
    ).toString('base64');
    await expect(
      verifyDesktopArtifact(file, signature, wrongKey)
    ).rejects.toThrow('другим ключом');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('манифест публикуется только при наличии всех платформ и подписей', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sep-updater-manifest-'));
  try {
    const packages = path.join(directory, 'packages');
    await mkdir(packages);
    await expect(
      createDesktopManifest(packages, directory, '1.48.7')
    ).rejects.toThrow();
    const fileNames = {
      'windows-x86_64': 'Chat-setup.exe',
      'linux-x86_64': 'Chat.AppImage',
      'darwin-x86_64': 'Chat.app.tar.gz',
      'darwin-aarch64': 'Chat.app.tar.gz'
    };
    for (const [target, file] of Object.entries(fileNames)) {
      await mkdir(path.join(packages, target));
      await writeFile(path.join(packages, target, file), 'fixture');
      await writeFile(
        path.join(packages, target, `${file}.sig`),
        Buffer.from('untrusted comment: test\nfixture').toString('base64')
      );
    }
    const manifest = await createDesktopManifest(packages, directory, '1.48.7');
    expect(Object.keys(manifest.platforms)).toHaveLength(4);
    expect(manifest.platforms['windows-x86_64'].url).toBe(
      'https://chat.pksep.ru/desktop/releases/1.48.7/windows-x86_64/Chat-setup.exe'
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
