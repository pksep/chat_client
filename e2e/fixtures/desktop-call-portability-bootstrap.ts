import { getVersion } from '@tauri-apps/api/app';

const report = (value: unknown) =>
  fetch('http://127.0.0.1:5213/report', {
    method: 'POST',
    body: JSON.stringify(value)
  });
try {
  await report({ step: 'minimal-version-request' });
  await report({
    step: 'minimal-version-response',
    version: await getVersion()
  });
} catch (error) {
  await report({ passed: false, error: String(error) });
}
