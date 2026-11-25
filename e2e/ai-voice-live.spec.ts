import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

// Opt-in: реальный локальный API и SpeechKit, синтетический WAV вместо микрофона человека.
const password = process.env.VOICE_E2E_PASSWORD;
const wav = process.env.VOICE_E2E_WAV;
const baseUrl = process.env.VOICE_E2E_URL || 'http://127.0.0.1:5174';

test.skip(
  !password || !wav,
  'Нужны локальные VOICE_E2E_PASSWORD и VOICE_E2E_WAV.'
);
test.setTimeout(150_000);
test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${wav ?? ''}%noloop`
    ]
  }
});

test('голос проходит через SpeechKit, обычный агент, историю и озвучку', async ({
  page,
  request
}, testInfo): Promise<void> => {
  expect(['localhost', '127.0.0.1']).toContain(new URL(baseUrl).hostname);
  const login = await request.post(`${baseUrl}/api/auth/credentials-login`, {
    data: { identifier: '001', password }
  });
  expect(login.ok()).toBe(true);
  const credentials = await login.json();
  expect(typeof credentials.accessToken).toBe('string');
  const organization = `${baseUrl}/.runtime.local`;
  await page.addInitScript(
    ({ token, user, organization }): void => {
      localStorage.setItem(
        'chat_auth_session',
        JSON.stringify({ token, user })
      );
      document.cookie = `authToken=${token};path=/;SameSite=Strict`;
      localStorage.setItem('chat_runtime_last_organization', organization);
      const target = window as typeof window & {
        voiceTestPlays: number;
        voiceTestTracks: MediaStreamTrack[];
      };
      target.voiceTestPlays = 0;
      target.voiceTestTracks = [];
      const originalPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (): Promise<void> {
        target.voiceTestPlays++;
        return originalPlay.call(this);
      };
      const originalMicrophone = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices
      );
      navigator.mediaDevices.getUserMedia = async (
        constraints
      ): Promise<MediaStream> => {
        const stream = await originalMicrophone(constraints);
        target.voiceTestTracks.push(...stream.getTracks());
        return stream;
      };
    },
    { token: credentials.accessToken, user: credentials.user, organization }
  );

  const metrics = {
    modelStatus: 0,
    modelRequests: 0,
    audioChunks: 0,
    synthesisRequests: 0,
    firstSynthesisAt: 0,
    modelFinishedAt: 0
  };
  const failures: number[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (/\/speech\/stream\//.test(path)) metrics.audioChunks++;
    if (path.endsWith('/speech/synthesize')) {
      metrics.synthesisRequests++;
      metrics.firstSynthesisAt ||= Date.now();
    }
    if (path.endsWith('/agents/generalAgent/stream')) {
      metrics.modelRequests++;
      expect(request.postDataJSON().requestContext.interactionMode).toBe(
        'voice'
      );
    }
  });
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith('/speech/') && response.status() >= 400)
      failures.push(response.status());
    if (path.endsWith('/agents/generalAgent/stream')) {
      metrics.modelStatus = response.status();
      void response.finished().then((): void => {
        metrics.modelFinishedAt = Date.now();
      });
    }
  });

  await page.goto(
    `${baseUrl}/ai?organization=${encodeURIComponent(organization)}`
  );
  await page
    .getByRole('button', { name: 'Голосовой режим', exact: true })
    .click({ timeout: 60_000 });
  const dialog = page.getByRole('dialog', { name: 'Голосовой режим' });
  await expect(dialog).toBeVisible();
  await expect.poll(() => metrics.modelRequests, { timeout: 40_000 }).toBe(1);
  await expect.poll(() => metrics.modelStatus, { timeout: 40_000 }).toBe(200);
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => metrics.synthesisRequests, { timeout: 80_000 })
    .toBeGreaterThan(0);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as typeof window & { voiceTestPlays: number })
              .voiceTestPlays
        ),
      { timeout: 30_000 }
    )
    .toBeGreaterThan(0);
  expect(metrics.audioChunks).toBeGreaterThan(2);
  expect(failures).toEqual([]);
  await dialog
    .getByRole('button', { name: 'Закрыть голосовой режим' })
    .click({ force: true });
  await expect(dialog).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as typeof window & { voiceTestTracks: MediaStreamTrack[] }
        ).voiceTestTracks.every(track => track.readyState === 'ended')
      )
    )
    .toBe(true);
  await expect
    .poll(() => metrics.modelFinishedAt, { timeout: 60_000 })
    .toBeGreaterThan(0);
  expect(metrics.modelRequests).toBe(1);
  expect(metrics.firstSynthesisAt).toBeLessThan(metrics.modelFinishedAt);
  const answer = page
    .getByRole('article')
    .filter({ hasText: /(?:4 часа|четыре часа)/i });
  await expect(answer).toHaveCount(1);
  const savedAnswer = await answer.innerText();
  await page.reload();
  await expect(page.locator('#startup-shell')).toBeHidden({ timeout: 30_000 });
  await expect(answer).toHaveCount(1);
  await expect(answer).toBeVisible();
  await expect(answer).toHaveText(savedAnswer, { useInnerText: true });
  await page.screenshot({
    path: testInfo.outputPath('voice-result.png'),
    fullPage: true
  });
  await testInfo.attach('voice-metrics', {
    body: JSON.stringify(metrics),
    contentType: 'application/json'
  });
  await writeFile(
    testInfo.outputPath('voice-metrics.json'),
    JSON.stringify(metrics, null, 2)
  );
});
