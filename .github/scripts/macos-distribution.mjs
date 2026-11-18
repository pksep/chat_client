import { execFile } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  appendFile,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

export const appleSecrets = [
  'APPLE_CERTIFICATE',
  'APPLE_CERTIFICATE_PASSWORD',
  'APPLE_SIGNING_IDENTITY',
  'APPLE_API_ISSUER',
  'APPLE_API_KEY',
  'APPLE_API_PRIVATE_KEY'
];

export const verificationStep =
  'Verify Apple signatures, notarization and Gatekeeper';

export function appleSigningMode(present, required = false) {
  const supplied = new Set(present);
  const missing = appleSecrets.filter(name => !supplied.has(name));
  if (missing.length === appleSecrets.length && !required) return 'manual';
  if (missing.length)
    throw new Error(
      `Не настроена подпись Apple. Добавьте GitHub Secrets: ${missing.join(', ')}`
    );
  return 'notarized';
}

export function signingTeam(identity) {
  const match = /^Developer ID Application: .+ \(([A-Z0-9]{10})\)$/.exec(
    identity || ''
  );
  if (!match)
    throw new Error(
      'Нужен сертификат Developer ID Application и его полное имя в APPLE_SIGNING_IDENTITY'
    );
  return match[1];
}

export function verifySigningDetails(details, identity, application = true) {
  const team = signingTeam(identity);
  const lines = details.split(/\r?\n/);
  if (
    !lines.includes(`Authority=${identity}`) ||
    !lines.includes(`TeamIdentifier=${team}`)
  )
    throw new Error(
      'Пакет не подписан ожидаемым сертификатом Apple Developer ID'
    );
  if (
    application &&
    (!lines.includes('Identifier=ru.pksep.chat') ||
      !/flags=.*\(.*runtime.*\)/.test(details))
  )
    throw new Error(
      'Приложение не имеет ожидаемого bundle ID или hardened runtime'
    );
}

export function verifyGatekeeper(details) {
  if (
    !/: accepted(?:\r?\n|$)/.test(details) ||
    !/^source=Notarized Developer ID\s*$/m.test(details)
  )
    throw new Error(
      'Gatekeeper не подтвердил нотарифицированное приложение Apple'
    );
}

export function requireVerifiedMacJobs(jobs) {
  for (const name of ['Build macOS Apple Silicon', 'Build macOS Intel']) {
    if (
      !jobs.some(
        job =>
          job.name === name &&
          job.conclusion === 'success' &&
          job.steps?.some(
            step =>
              step.name === verificationStep && step.conclusion === 'success'
          )
      )
    )
      throw new Error(`В исходной сборке нет успешной проверки Apple: ${name}`);
  }
}

export function verifyDistributionReport(report, platform, version) {
  const checks = [
    'appleSigned',
    'notarized',
    'appGatekeeper',
    'updaterGatekeeper',
    'dmgGatekeeper',
    'mountedAppGatekeeper'
  ];
  if (
    report.platform !== platform ||
    report.version !== version ||
    !checks.every(check => report[check] === true)
  )
    throw new Error(
      `Нет подтверждения подписи Apple и Gatekeeper для ${platform} ${version}`
    );
}

const runFile = promisify(execFile);
const run = async (file, args) => {
  const result = await runFile(file, args, {
    env: { ...process.env, LC_ALL: 'C' },
    timeout: 35 * 60 * 1000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true
  });
  return `${result.stdout}\n${result.stderr}`;
};
const temporaryBase = () => path.resolve(process.env.RUNNER_TEMP || tmpdir());

async function prepare() {
  signingTeam(process.env.APPLE_SIGNING_IDENTITY);
  if (
    !/^[A-Z0-9]{10}$/.test(process.env.APPLE_API_KEY || '') ||
    !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(
      process.env.APPLE_API_ISSUER || ''
    )
  )
    throw new Error(
      'Проверьте APPLE_API_KEY и APPLE_API_ISSUER в GitHub Secrets'
    );
  const key = process.env.APPLE_API_PRIVATE_KEY?.trim();
  if (
    !key?.startsWith('-----BEGIN PRIVATE KEY-----') ||
    !key.endsWith('-----END PRIVATE KEY-----')
  )
    throw new Error(
      'В APPLE_API_PRIVATE_KEY нужен полный текст ключа AuthKey.p8'
    );
  if (!process.env.GITHUB_OUTPUT) throw new Error('Не задан GITHUB_OUTPUT');
  const directory = await mkdtemp(
    path.join(temporaryBase(), 'sep-chat-apple-signing-')
  );
  const keyFile = path.join(directory, 'AuthKey.p8');
  try {
    await writeFile(keyFile, `${key}\n`, { mode: 0o600 });
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `key_file=${keyFile}\nkey_dir=${directory}\n`
    );
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function verify(platform) {
  const target = {
    'darwin-aarch64': 'aarch64-apple-darwin',
    'darwin-x86_64': 'x86_64-apple-darwin'
  }[platform];
  if (!target) throw new Error('Неизвестная платформа macOS');
  const identity = process.env.APPLE_SIGNING_IDENTITY;
  const team = signingTeam(identity);
  const version = process.env.DESKTOP_VERSION;
  if (!/^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(version || ''))
    throw new Error('Не задан DESKTOP_VERSION');
  const bundle = path.resolve('src-tauri/target', target, 'release/bundle');
  const { productName } = JSON.parse(
    await readFile('src-tauri/tauri.conf.json', 'utf8')
  );
  const appName = `${productName}.app`;
  const app = path.join(bundle, 'macos', appName);
  const archive = `${app}.tar.gz`;
  const dmgs = (await readdir(path.join(bundle, 'dmg'))).filter(name =>
    name.endsWith('.dmg')
  );
  if (dmgs.length !== 1) throw new Error('Ожидается ровно один установщик DMG');
  const dmg = path.join(bundle, 'dmg', dmgs[0]);
  const auth = [
    '--key',
    process.env.APPLE_API_KEY_PATH,
    '--key-id',
    process.env.APPLE_API_KEY,
    '--issuer',
    process.env.APPLE_API_ISSUER
  ];
  if (auth.some(value => !value))
    throw new Error('Не заданы данные App Store Connect для нотарификации');
  const checkApp = async candidate => {
    await run('codesign', [
      '--verify',
      '--deep',
      '--strict',
      '--verbose=2',
      candidate
    ]);
    verifySigningDetails(
      await run('codesign', ['--display', '--verbose=4', candidate]),
      identity
    );
    const appVersion = (
      await run('/usr/libexec/PlistBuddy', [
        '-c',
        'Print CFBundleShortVersionString',
        path.join(candidate, 'Contents/Info.plist')
      ])
    ).trim();
    if (appVersion !== version)
      throw new Error(
        'Версия подписанного приложения отличается от версии релиза'
      );
    await run('xcrun', ['stapler', 'validate', candidate]);
    verifyGatekeeper(
      await run('spctl', [
        '--assess',
        '--type',
        'execute',
        '--verbose=4',
        candidate
      ])
    );
  };
  // Tauri подписывает и нотарифицирует .app до создания архива для updater.
  await checkApp(app);
  const root = await mkdtemp(
    path.join(temporaryBase(), 'sep-chat-macos-distribution-')
  );
  const mounted = path.join(root, 'mounted');
  let isMounted = false;
  try {
    const extracted = path.join(root, 'updater');
    await mkdir(extracted);
    await run('tar', ['-xzf', archive, '-C', extracted]);
    await checkApp(path.join(extracted, appName));
    await run('codesign', ['--verify', '--strict', '--verbose=2', dmg]);
    verifySigningDetails(
      await run('codesign', ['--display', '--verbose=4', dmg]),
      identity,
      false
    );
    // Билет DMG прикрепляется после сборки; архив updater при этом не меняется.
    const submitted = JSON.parse(
      await runFile(
        'xcrun',
        [
          'notarytool',
          'submit',
          dmg,
          ...auth,
          '--wait',
          '--timeout',
          '30m',
          '--output-format',
          'json'
        ],
        {
          env: process.env,
          timeout: 35 * 60 * 1000,
          maxBuffer: 4 * 1024 * 1024
        }
      ).then(result => result.stdout)
    );
    if (submitted.status !== 'Accepted')
      throw new Error(
        `Apple отклонила DMG: ${submitted.status}, ID ${submitted.id}`
      );
    await run('xcrun', ['stapler', 'staple', dmg]);
    await run('xcrun', ['stapler', 'validate', dmg]);
    verifyGatekeeper(
      await run('spctl', [
        '--assess',
        '--type',
        'open',
        '--context',
        'context:primary-signature',
        '--verbose=4',
        dmg
      ])
    );
    await mkdir(mounted);
    await run('hdiutil', [
      'attach',
      '-readonly',
      '-nobrowse',
      '-mountpoint',
      mounted,
      dmg
    ]);
    isMounted = true;
    await checkApp(path.join(mounted, appName));
    await mkdir('test-results', { recursive: true });
    await writeFile(
      `test-results/apple-distribution-${platform}.json`,
      JSON.stringify(
        {
          version,
          platform,
          team,
          appleSigned: true,
          notarized: true,
          appGatekeeper: true,
          updaterGatekeeper: true,
          dmgGatekeeper: true,
          mountedAppGatekeeper: true,
          notarySubmissionId: submitted.id
        },
        null,
        2
      )
    );
  } finally {
    if (isMounted) await run('hdiutil', ['detach', mounted]);
    await rm(root, { recursive: true, force: true });
  }
}

async function cleanup() {
  const directory = path.resolve(process.env.SIGNING_DIRECTORY || '.');
  if (
    path.dirname(directory) !== temporaryBase() ||
    !path.basename(directory).startsWith('sep-chat-apple-signing-')
  )
    throw new Error('Недопустимый каталог временного ключа Apple');
  await rm(directory, { recursive: true, force: true });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  if (process.platform !== 'darwin')
    throw new Error('Эта команда требует macOS');
  const command = { prepare, verify: () => verify(process.argv[3]), cleanup }[
    process.argv[2]
  ];
  if (!command) throw new Error('Укажите prepare, verify или cleanup');
  await command();
}
