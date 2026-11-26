import { getVersion } from '@tauri-apps/api/app';

const report = (value: unknown) =>
  fetch('http://127.0.0.1:5213/report', {
    method: 'POST',
    body: JSON.stringify(value)
  });
const deadline = setTimeout(
  () =>
    void report({ passed: false, error: 'Превышено время нативной проверки' }),
  60_000
);
try {
  await report({ step: 'minimal-version-request' });
  await report({
    step: 'minimal-version-response',
    version: await getVersion()
  });
  await import('./desktop-call-portability');
} catch (error) {
  await report({ passed: false, error: String(error) });
} finally {
  clearTimeout(deadline);
}
