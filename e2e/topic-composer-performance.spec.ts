import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import {
  makeMessages,
  message,
  metrics,
  openFixture,
  openTopic,
  resetMetrics
} from './fixtures/topic-performance-page';

test('мобильный первый кадр темы содержит поле ввода полной высоты', async ({
  page
}) => {
  await page.setViewportSize({ width: 392, height: 832 });
  const { errors } = await openFixture(page, { shell: true });
  const frames = await page.evaluate(async () => {
    const samples: { at: number; inputHeight: number }[] = [];
    const started = performance.now();
    (window as any).topicPerformance.navigate('performance-0');

    while (performance.now() - started < 350) {
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve())
      );
      samples.push({
        at: performance.now() - started,
        inputHeight: Math.round(
          document.querySelector('.chat__input')?.getBoundingClientRect()
            .height || 0
        )
      });
    }

    return samples;
  });

  expect(frames.length).toBeGreaterThan(0);
  expect(frames[0].inputHeight).toBeGreaterThanOrEqual(75);
  expect(frames.every(frame => frame.inputHeight >= 75)).toBe(true);
  expect(errors).toEqual([]);
});

test('эмодзи создаются по нажатию, вставляются в черновик и сохраняются после возврата', async ({
  page
}) => {
  const { errors } = await openFixture(page, { shell: true });
  await openTopic(page, 0);
  await expect(message(page, 0)).toBeVisible();
  const editor = page.locator('[contenteditable="true"]');
  await editor.fill('Черновик');
  await expect(
    page.locator('.emoji-picker--open .v3-emoji-picker')
  ).toHaveCount(0);
  const smile = page.locator('.chat__input .smile-button:visible');
  await smile.click();
  const picker = page.locator('.emoji-picker--open .v3-emoji-picker');
  await expect(picker).toBeVisible();
  const emoji = picker.locator('.v3-emojis button:visible').first();
  const selectedEmoji = (await emoji.textContent())!.trim();
  await emoji.click();
  await expect(editor).toContainText(selectedEmoji);
  await page.getByTestId('open-performance-0').click();
  await expect(picker).toBeHidden();
  await smile.click();
  await expect(picker).toBeVisible();
  await page.evaluate(() => (window as any).topicPerformance.back());
  await expect(page.locator('.chat__input')).toHaveCount(0);
  await expect(page.locator('.v3-emoji-picker')).toHaveCount(0);
  await openTopic(page, 1);
  await expect(editor).toHaveText('');
  await expect(
    page.locator('.emoji-picker--open .v3-emoji-picker')
  ).toHaveCount(0);
  await page.evaluate(() => (window as any).topicPerformance.back());
  await openTopic(page, 0);
  await expect(editor).toContainText('Черновик');
  await expect(editor).toContainText(selectedEmoji);
  await expect(
    page.locator('.emoji-picker--open .v3-emoji-picker')
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('мобильный поиск эмодзи получает фокус по касанию', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Проверка требует touch-контекст');
  await page.setViewportSize({ width: 392, height: 832 });
  const { errors } = await openFixture(page, { shell: true });
  await openTopic(page, 0);
  await expect(message(page, 0)).toBeVisible();

  await page.locator('.chat__input .smile-button:visible').click();
  const picker = page.locator('.emoji-picker--open .v3-emoji-picker');
  const search = picker.locator('.v3-search input');
  await expect(search).toBeVisible();
  await search.tap();
  await expect(search).toBeFocused();
  await search.fill('rocket');
  await expect(search).toHaveValue('rocket');
  await expect(picker.locator('.v3-emojis button:visible')).not.toHaveCount(0);
  expect(errors).toEqual([]);
});

test('первое открытие эмодзи работает и в редакторе вложения', async ({
  page,
  isMobile
}) => {
  const { errors } = await openFixture(page, { shell: true });
  await openTopic(page, 0);
  await expect(message(page, 0)).toBeVisible();
  await expect(
    page.locator('.emoji-picker--open .v3-emoji-picker')
  ).toHaveCount(0);
  await page
    .locator('.chat__input input[type="file"]:not([accept])')
    .setInputFiles({
      name: 'chat-294.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('CHAT-294')
    });
  const modal = page.locator('dialog.attach-modal-container');
  await expect(modal).toBeVisible();
  await modal.locator('.smile-button').click();
  const picker = modal.locator('.emoji-picker--open .v3-emoji-picker');
  await expect(picker).toBeVisible();
  if (isMobile) {
    const search = picker.locator('.v3-search input');
    await search.tap();
    await expect(search).toBeFocused();
  }
  const emoji = picker.locator('.v3-emojis button:visible').first();
  const selectedEmoji = (await emoji.textContent())!.trim();
  await emoji.click();
  await expect(modal.locator('[contenteditable="true"]')).toContainText(
    selectedEmoji
  );
  const box = await picker.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(errors).toEqual([]);
});

test('мобильный первый кадр не расширяется повторно сразу после загрузки', async ({
  page
}) => {
  await page.setViewportSize({ width: 392, height: 832 });
  const { requests, errors } = await openFixture(page, {
    count: 300,
    shell: true
  });
  await openTopic(page, 0);
  await expect(message(page, 0, 299)).toBeVisible();
  await page.waitForTimeout(800);
  await page.evaluate(() => (window as any).topicPerformance.back());
  await expect(page.locator('.chat__input')).toHaveCount(0);
  const requestsBefore = requests.length;
  const frames = await page.evaluate(async () => {
    const frames: { at: number; count: number }[] = [];
    const started = performance.now();
    (window as any).topicPerformance.navigate('performance-0');
    while (performance.now() - started < 350) {
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve())
      );
      frames.push({
        at: performance.now() - started,
        count: document.querySelectorAll('.message[data-message-id]').length
      });
    }
    return frames;
  });
  expect(frames.length).toBeGreaterThan(2);
  expect(frames.every(frame => frame.count >= 24 && frame.count <= 48)).toBe(
    true
  );
  await expect(page.locator('.message[data-message-id]')).toHaveCount(72);
  await expect(message(page, 0, 299)).toBeVisible();
  expect(requests.length).toBe(requestsBefore);
  expect(errors).toEqual([]);
});

test('полный цикл список–топик: 5000 сообщений, быстрые возвраты без лишнего DOM и запросов', async ({
  page
}, testInfo) => {
  await page.setViewportSize({ width: 392, height: 832 });
  const switches = Number(process.env.PERFORMANCE_SWITCHES || 60);
  test.setTimeout(Math.max(90_000, 30_000 + switches * 1000));
  const state = await openFixture(page, { count: 5000, shell: true });
  await page.evaluate(
    rows =>
      rows.forEach((rows, index) => {
        (window as any).topicPerformance.seed(`performance-${index}`, rows);
      }),
    [0, 1, 2].map(index => makeMessages(`performance-${index}`, 5000))
  );
  for (const index of [0, 1, 2]) {
    await openTopic(page, index);
    await expect(message(page, index, 4999)).toBeVisible();
    await page.waitForTimeout(700);
    await page.evaluate(() => (window as any).topicPerformance.back());
    await expect(page.locator('.chat__input')).toHaveCount(0);
  }
  // Истечение TTL проверяется отдельно: здесь нагрузка на повторное создание интерфейса.
  await page.evaluate(() => {
    const now = Date.now();
    Date.now = () => now;
  });
  const requestCount = state.requests.length;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  const before = await cdp.send('Memory.getDOMCounters');
  const heapBefore = await cdp.send('Runtime.getHeapUsage');
  await resetMetrics(page);
  const result = await page.evaluate(async switches => {
    const times: number[] = [];
    let wrongTopicFrames = 0,
      maxDomNodes = 0;
    const frame = () =>
      new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    for (let i = 0; i < switches; i++) {
      const topicId = `performance-${i % 3}`;
      const started = performance.now();
      (
        document.querySelector(`[data-testid="open-${topicId}"]`) as HTMLElement
      ).click();
      while (true) {
        await frame();
        const nodes = [
          ...document.querySelectorAll<HTMLElement>('[data-message-id]')
        ];
        if (
          nodes.some(node => !node.dataset.messageId?.startsWith(`${topicId}-`))
        )
          wrongTopicFrames++;
        const target = nodes.find(
          node => node.dataset.messageId === `${topicId}-message-4999`
        );
        if (target?.getBoundingClientRect().height) break;
        if (performance.now() - started > 2000)
          throw Error('Топик не отрисован за 2 секунды');
      }
      times.push(performance.now() - started);
      maxDomNodes = Math.max(
        maxDomNodes,
        document.querySelectorAll('*').length
      );
      (window as any).topicPerformance.back();
      await frame();
      if (document.querySelector('.chat__input'))
        throw Error('Редактор не уничтожен после возврата');
    }
    times.sort((a, b) => a - b);
    return {
      switches,
      wrongTopicFrames,
      maxDomNodes,
      p50: times[Math.ceil(times.length * 0.5) - 1],
      p95: times[Math.ceil(times.length * 0.95) - 1],
      max: times.at(-1)
    };
  }, switches);
  await page.waitForTimeout(800);
  await cdp.send('HeapProfiler.collectGarbage');
  const after = await cdp.send('Memory.getDOMCounters');
  const heapAfter = await cdp.send('Runtime.getHeapUsage');
  const report = {
    ...result,
    ...(await metrics(page)),
    before,
    after,
    heapGrowthBytes: heapAfter.usedSize - heapBefore.usedSize,
    extraRequests: state.requests.slice(requestCount)
  };
  await writeFile(
    testInfo.outputPath('full-topic-switch.json'),
    JSON.stringify(report, null, 2)
  );
  await cdp.detach();
  expect(report.wrongTopicFrames).toBe(0);
  expect(report.skeletonFrames).toBe(0);
  expect(report.p95).toBeLessThan(300);
  expect(report.maxDomNodes).toBeLessThan(2500);
  expect(report.extraRequests).toEqual([]);
  expect(after.nodes - before.nodes).toBeLessThan(1000);
  expect(after.jsEventListeners - before.jsEventListeners).toBeLessThan(200);
  expect(report.heapGrowthBytes).toBeLessThan(20 * 1024 * 1024);
  expect(state.errors).toEqual([]);
});
