import { expect, test } from 'bun:test';
import {
  appleSecrets,
  appleSigningMode,
  signingTeam,
  verifySigningDetails,
  verifyGatekeeper,
  requireVerifiedMacJobs,
  verificationStep,
  verifyDistributionReport
} from '../.github/scripts/macos-distribution.mjs';

const identity = 'Developer ID Application: SEP Test (AB12345678)';
const details = [
  'Identifier=ru.pksep.chat',
  'CodeDirectory v=20500 size=123 flags=0x10000(runtime) hashes=12+7',
  `Authority=${identity}`,
  'Authority=Developer ID Certification Authority',
  'TeamIdentifier=AB12345678'
].join('\n');

test('без аккаунта Apple сохраняется явный режим ручной установки', () => {
  expect(appleSigningMode([])).toBe('manual');
  expect(() => appleSigningMode([], true)).toThrow('APPLE_CERTIFICATE');
});

test('неполные секреты не отключают нотарификацию молча', () => {
  expect(() => appleSigningMode(['APPLE_CERTIFICATE'])).toThrow(
    'APPLE_API_PRIVATE_KEY'
  );
  expect(appleSigningMode(appleSecrets, true)).toBe('notarized');
});

test('принимается Developer ID Application, тестовая и installer-подпись отклоняются', () => {
  expect(signingTeam(identity)).toBe('AB12345678');
  for (const value of [
    '-',
    'Apple Development: SEP (AB12345678)',
    'Developer ID Installer: SEP (AB12345678)'
  ])
    expect(() => signingTeam(value)).toThrow();
  verifySigningDetails(details, identity);
  expect(() =>
    verifySigningDetails(
      details.replace('TeamIdentifier=AB12345678', 'TeamIdentifier=ZZ12345678'),
      identity
    )
  ).toThrow();
  expect(() =>
    verifySigningDetails(
      details.replace(`Authority=${identity}`, 'Signature=adhoc'),
      identity
    )
  ).toThrow();
});

test('приложению нужны правильный bundle ID и hardened runtime', () => {
  expect(() =>
    verifySigningDetails(
      details.replace('ru.pksep.chat', 'ru.pksep.other'),
      identity
    )
  ).toThrow();
  expect(() =>
    verifySigningDetails(
      details.replace('flags=0x10000(runtime)', 'flags=0x0(none)'),
      identity
    )
  ).toThrow();
  verifySigningDetails(
    details.replace('flags=0x10000(runtime)', 'flags=0x0(none)'),
    identity,
    false
  );
});

test('Gatekeeper должен принять нотарифицированный пакет, отключённая защита не считается проверкой', () => {
  verifyGatekeeper(
    '/tmp/SEP Chat.app: accepted\nsource=Notarized Developer ID\norigin=Developer ID Application: SEP'
  );
  for (const result of [
    'assessments disabled',
    '/tmp/SEP Chat.app: rejected\nsource=Notarized Developer ID',
    '/tmp/SEP Chat.app: accepted\nsource=Unnotarized Developer ID'
  ])
    expect(() => verifyGatekeeper(result)).toThrow();
});

test('повторная публикация старых артефактов требует настоящей проверки Apple на обеих архитектурах', () => {
  const jobs = ['Build macOS Apple Silicon', 'Build macOS Intel'].map(name => ({
    name,
    conclusion: 'success',
    steps: [{ name: verificationStep, conclusion: 'success' }]
  }));
  requireVerifiedMacJobs(jobs);
  expect(() => requireVerifiedMacJobs(jobs.slice(0, 1))).toThrow();
  jobs[1].steps[0].conclusion = 'skipped';
  expect(() => requireVerifiedMacJobs(jobs)).toThrow();
  expect(() =>
    requireVerifiedMacJobs(jobs.map(job => ({ ...job, steps: [] })))
  ).toThrow();
});

test('публикация требует проверенный установщик и архив updater для конкретного релиза', () => {
  const report = {
    version: '1.52.3',
    platform: 'darwin-aarch64',
    appleSigned: true,
    notarized: true,
    appGatekeeper: true,
    updaterGatekeeper: true,
    dmgGatekeeper: true,
    mountedAppGatekeeper: true
  };
  verifyDistributionReport(report, 'darwin-aarch64', '1.52.3');
  expect(() =>
    verifyDistributionReport(report, 'darwin-x86_64', '1.52.3')
  ).toThrow();
  expect(() =>
    verifyDistributionReport(report, 'darwin-aarch64', '1.52.4')
  ).toThrow();
  expect(() =>
    verifyDistributionReport(
      { ...report, updaterGatekeeper: false },
      'darwin-aarch64',
      '1.52.3'
    )
  ).toThrow();
  expect(() =>
    verifyDistributionReport(
      { ...report, dmgGatekeeper: false },
      'darwin-aarch64',
      '1.52.3'
    )
  ).toThrow();
  expect(() =>
    verifyDistributionReport(
      { ...report, appGatekeeper: 'false' },
      'darwin-aarch64',
      '1.52.3'
    )
  ).toThrow();
});
