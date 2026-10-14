import { expect, test } from '@playwright/test';
import { mockStickerCatalog } from './fixtures/sticker-catalog';

test.beforeEach(async ({ page }) => {
  await mockStickerCatalog(page);
});

test('время, статус и реакции стикера выглядят как у одного эмодзи', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/sticker-footer.html');
  const timeStyles = (testId: string) =>
    page.getByTestId(`${testId}-Time`).evaluate(element => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        color: style.color,
        radius: style.borderRadius,
        padding: style.padding,
        gap: style.gap,
        font: style.font,
        height: element.getBoundingClientRect().height,
        icons: [...element.querySelectorAll('svg')].map(icon => {
          const rect = icon.getBoundingClientRect();
          return [rect.width, rect.height];
        })
      };
    });
  for (const theme of ['Светлая тема', 'Тёмная тема']) {
    await page.getByRole('button', { name: theme, exact: true }).click();
    for (const reactions of [false, true]) {
      for (const status of ['Отправка', 'Доставлено', 'Ошибка']) {
        await page.getByRole('button', { name: status, exact: true }).click();
        for (const direction of ['Outgoing', 'Incoming']) {
          expect(await timeStyles(`Sticker-${direction}`)).toEqual(
            await timeStyles(`Emoji-${direction}`)
          );
          const sticker = page.getByTestId(
            `Sticker-${direction}-MessageBubble-Container`
          );
          const emoji = page.getByTestId(
            `Emoji-${direction}-MessageBubble-Container`
          );
          await expect(sticker.locator('.reaction')).toHaveCount(
            reactions ? 1 : 0
          );
          if (reactions) {
            const readReactionStyle = (element: Element) => {
              const style = getComputedStyle(element);
              return [
                style.backgroundColor,
                style.color,
                style.borderRadius,
                style.padding,
                style.height
              ];
            };
            expect(
              await sticker.locator('.reaction').evaluate(readReactionStyle)
            ).toEqual(
              await emoji.locator('.reaction').evaluate(readReactionStyle)
            );
          }
        }
      }
      await page
        .getByRole('button', { name: 'Переключить реакции', exact: true })
        .click();
    }
  }
});

test('новый стикер плавно появляется без изменения размера', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/sticker-list.html');
  await page
    .getByRole('button', { name: 'Добавить стикер', exact: true })
    .click();
  const stack = page.locator('.message-sticker-stack');
  const samples = await stack.evaluate(async element => {
    const animation = element.getAnimations()[0];
    animation.pause();
    animation.currentTime = 0;
    const read = () => {
      const rect = element.getBoundingClientRect();
      return {
        opacity: Number(getComputedStyle(element).opacity),
        width: rect.width,
        height: rect.height,
        top: rect.top
      };
    };
    const frames = [read()];
    animation.play();
    const startedAt = performance.now();
    while (performance.now() - startedAt < 220) {
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve())
      );
      frames.push(read());
    }
    return frames;
  });
  expect(samples[0].opacity).toBe(0);
  expect(samples.at(-1)!.opacity).toBe(1);
  expect(samples.some(sample => sample.opacity > 0 && sample.opacity < 1)).toBe(
    true
  );
  for (const sample of samples) {
    expect(sample.width).toBe(samples[0].width);
    expect(sample.height).toBe(samples[0].height);
    expect(sample.top).toBe(samples[0].top);
  }
});

test('стикер учитывает настройку уменьшения движения', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/e2e/fixtures/sticker-list.html');
  await page
    .getByRole('button', { name: 'Добавить стикер', exact: true })
    .click();
  const stack = page.locator('.message-sticker-stack');
  await expect(stack).toHaveCSS('animation-name', 'none');
  await expect(stack).toHaveCSS('opacity', '1');
});

test('добавление и подтверждение стикера сохраняют уже показанные изображения', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/sticker-list.html');
  const append = page.getByRole('button', {
    name: 'Добавить стикер',
    exact: true
  });
  await append.click();
  const images = page.locator('.message-sticker__animation');
  await expect(images).toHaveClass(/--loaded/);
  const firstImage = await images.elementHandle();

  await page
    .getByRole('button', { name: 'Подтвердить доставку', exact: true })
    .click();
  await expect(page.locator('[data-message-id="server-1"]')).toHaveCount(1);
  expect(await firstImage!.evaluate(image => image.isConnected)).toBe(true);

  await append.click();
  await expect(images).toHaveCount(2);
  expect(await firstImage!.evaluate(image => image.isConnected)).toBe(true);
  const secondImage = await images.nth(1).elementHandle();
  await page
    .getByRole('button', { name: 'Подтвердить доставку', exact: true })
    .click();
  await expect(page.locator('[data-message-id="server-2"]')).toHaveCount(1);
  expect(await secondImage!.evaluate(image => image.isConnected)).toBe(true);

  await page
    .getByRole('button', { name: 'Добавить текст', exact: true })
    .click();
  expect(await firstImage!.evaluate(image => image.isConnected)).toBe(true);
  expect(await secondImage!.evaluate(image => image.isConnected)).toBe(true);

  for (let index = 0; index < 13; index += 1) await append.click();
  await expect(page.locator('.message-group')).toHaveCount(2);
  expect(await firstImage!.evaluate(image => image.isConnected)).toBe(true);
  expect(await secondImage!.evaluate(image => image.isConnected)).toBe(true);
});

test('стикеры: порядок, поиск на двух языках, отправка без изменения черновика и без слайдера', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/stickers.html');
  const trigger = page.locator('.smile-button:visible');
  await trigger.click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  const items = page.locator('.sticker-picker__item');
  await expect(items).toHaveCount(15);
  expect(
    await items.evaluateAll(elements =>
      elements.map(element => {
        const { width, height } = element.getBoundingClientRect();
        return [Math.round(width), Math.round(height)];
      })
    )
  ).toEqual(Array.from({ length: 15 }, () => [60, 60]));
  expect(
    await items.evaluateAll(elements =>
      elements.map(el => el.getAttribute('data-sticker-id'))
    )
  ).toEqual([
    'sep-robot-heart',
    'sep-robot-sad',
    'sep-robot-yes',
    'sep-robot-happy',
    'sep-robot-thinking',
    'sep-robot-devil',
    'sep-robot-star-eyes',
    'sep-robot-sleepy',
    'sep-robot-shy',
    'sep-robot-surprised',
    'sep-robot-cool',
    'sep-robot-starstruck',
    'sep-robot-angry',
    'sep-robot-confused',
    'sep-robot-dizzy'
  ]);
  const search = page.locator('.v3-search input:visible');
  for (const query of ['люблю', 'LOVE']) {
    await search.fill(query);
    await expect(items).toHaveCount(1);
    await expect(
      page.locator('.sticker-picker__item[data-sticker-id="sep-robot-heart"]')
    ).toBeVisible();
  }
  for (const [query, expected] of [
    ['сердечки', 'heart'],
    ['ОК', 'yes'],
    ['agree', 'yes'],
    ['голова кругом', 'dizzy'],
    ['thinking robot', 'thinking'],
    ['сонный', 'sleepy'],
    ['good night', 'sleepy'],
    ['СМУЩ', 'shy'],
    ['злой', 'angry'],
    ['MAD', 'angry'],
    ['звёзд', 'starstruck'],
    ['confused', 'confused'],
    ['очки', 'cool']
  ]) {
    await search.fill(query);
    await expect(
      page.locator(
        `.sticker-picker__item[data-sticker-id="sep-robot-${expected}"]`
      )
    ).toBeVisible();
  }
  await search.fill('   ');
  await expect(items).toHaveCount(15);
  await search.fill('несуществующий');
  await expect(
    page.getByText('Стикеры не найдены', { exact: true })
  ).toBeVisible();
  await search.fill('agree');
  await page
    .getByRole('button', { name: 'Отправить стикер: Да', exact: true })
    .click();
  const message = page.getByTestId('StickerMessage-Sticker');
  await expect(message).toBeVisible();
  await expect(page.getByTestId('SendCount')).toHaveText('Отправлено: 1');
  await expect(page.getByTestId('Draft')).toHaveText(
    '<p>Несохранённый черновик</p>'
  );
  await expect(page.locator('.emoji-picker--open')).toHaveCount(0);
  await expect(message).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(message.locator('.message-sticker__image')).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)'
  );
  await expect(message.locator('.message-sticker__animation')).toHaveClass(
    /--loaded/
  );
  await message.locator('.message-sticker__image').click();
  await expect(page.locator('dialog:visible')).toHaveCount(0);
  await expect(page.locator('.message-bubble-tail')).toHaveCount(0);
  await expect(page.locator('.message__article__media')).toHaveCount(0);
  await expect(page.getByTestId('SendCount')).toHaveText('Отправлено: 1');

  await page.getByRole('button', { name: 'Тёмная тема', exact: true }).click();
  await expect(message).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await trigger.click();
  // Переключение обратно к обычным эмоджи сохраняет их группы и вставку в текст.
  await page.locator('.v3-search input:visible').fill('');
  await page
    .getByRole('button', { name: 'Смайлы и люди', exact: true })
    .click();
  await expect(page.locator('.v3-body-inner:visible')).toBeVisible();
  await page
    .locator('#smileys_people .v3-emojis button:visible')
    .first()
    .click();
  await expect(page.getByTestId('Draft')).not.toHaveText(
    '<p>Несохранённый черновик</p>'
  );
  await expect(page.getByTestId('SendCount')).toHaveText('Отправлено: 1');
});

test('реальный отправитель сразу ставит стикер в очередь без связи и сохраняет черновик', async ({
  page
}) => {
  const uploads: string[] = [];
  page.on('request', request => {
    if (
      ['POST', 'PUT'].includes(request.method()) &&
      /\/media|\/upload|\/multipart/.test(request.url())
    )
      uploads.push(request.url());
  });
  await page.route('https://**/*', route => route.abort());
  await page.goto('/e2e/fixtures/stickers.html?offline=1');
  await page.locator('.smile-button:visible').click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  await page
    .getByRole('button', { name: 'Отправить стикер: Любовь', exact: true })
    .click();
  await expect(page.getByTestId('SendCount')).toHaveText('Отправлено: 1');
  await expect(page.getByTestId('StickerMessage-Sticker')).toBeVisible();
  await expect(page.getByTestId('Draft')).toHaveText(
    '<p>Несохранённый черновик</p>'
  );
  await expect(page.getByTestId('StickerMessage-SendingIcon')).toBeVisible();
  await expect(page.locator('.message__article__media')).toHaveCount(0);
  expect(uploads).toEqual([]);
});

for (const [stickerId, stickerLabel] of [
  ['heart', 'Любовь'],
  ['sad', 'Грусть'],
  ['thinking', 'Думаю'],
  ['yes', 'Да'],
  ['happy', 'Радость']
]) {
  test(`первый стикер «${stickerLabel}» сохраняет масштаб при переходе от превью к анимации`, async ({
    page
  }) => {
    let releaseAnimation!: () => void;
    const animationReady = new Promise<void>(resolve => {
      releaseAnimation = resolve;
    });
    await page.route(`**/sep-robots/v1/${stickerId}.webp`, async route => {
      await animationReady;
      await route.fallback();
    });
    try {
      await page.goto('/e2e/fixtures/stickers.html');
      await page.locator('.smile-button:visible').click();
      await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
      await page
        .getByRole('button', {
          name: `Отправить стикер: ${stickerLabel}`,
          exact: true
        })
        .click();
      const image = page
        .getByTestId('StickerMessage-Sticker')
        .locator('.message-sticker__image');
      const preview = image.locator('img').first();
      const animation = image.locator('.message-sticker__animation');
      await expect(preview).toBeVisible();
      await expect
        .poll(() =>
          preview.evaluate(el => (el as HTMLImageElement).naturalWidth)
        )
        .toBeGreaterThan(0);
      await expect(animation).not.toHaveClass(/--loaded/);
      const before = await image.boundingBox();
      const previewSrc = await preview.getAttribute('src');
      releaseAnimation();
      await expect(animation).toHaveClass(/--loaded/);
      const animationSrc = await animation.getAttribute('src');
      await expect(preview).toBeHidden();
      expect(await image.boundingBox()).toEqual(before);

      // Сравниваем поля рисунка, а не только размер элемента: другой crop тоже даёт скачок.
      const [previewBounds, animationBounds] = await page.evaluate(
        async sources => {
          const bounds = async (src: string) => {
            const response = await fetch(src);
            const decoder = new ImageDecoder({
              data: await response.arrayBuffer(),
              type: response.headers.get('content-type')!.split(';')[0]
            });
            const { image: frame } = await decoder.decode({ frameIndex: 0 });
            const canvas = document.createElement('canvas');
            canvas.width = 220;
            canvas.height = 220;
            const context = canvas.getContext('2d')!;
            context.drawImage(frame, 0, 0, 220, 220);
            frame.close();
            decoder.close();
            const { data } = context.getImageData(0, 0, 220, 220);
            let left = 220;
            let top = 220;
            let right = -1;
            let bottom = -1;
            for (let y = 0; y < 220; y += 1) {
              for (let x = 0; x < 220; x += 1) {
                if (data[(y * 220 + x) * 4 + 3] < 32) continue;
                left = Math.min(left, x);
                top = Math.min(top, y);
                right = Math.max(right, x);
                bottom = Math.max(bottom, y);
              }
            }
            return [left, top, right, bottom];
          };
          return Promise.all(sources.map(bounds));
        },
        [previewSrc!, animationSrc!]
      );
      previewBounds.forEach((value, index) => {
        expect(Math.abs(value - animationBounds[index])).toBeLessThanOrEqual(1);
      });
    } finally {
      releaseAnimation();
    }
  });
}

test('анимация постоянно движется после нескольких циклов и не перезапускается по клику', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/stickers.html');
  await page.locator('.smile-button:visible').click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  await page
    .getByRole('button', { name: 'Отправить стикер: Любовь', exact: true })
    .click();
  const playback = page
    .getByTestId('StickerMessage-Sticker')
    .locator('.message-sticker__image');
  const image = playback.locator('.message-sticker__animation');
  await expect(image).toHaveClass(/--loaded/);
  await expect(playback).toHaveCSS('cursor', 'pointer');
  const source = await image.getAttribute('src');
  await playback.click();
  expect(await image.getAttribute('src')).toBe(source);
  await page.waitForTimeout(8000);
  await expect(image).toBeVisible();
  await expect(image).toHaveClass(/--loaded/);
  expect(await image.getAttribute('src')).toBe(source);
  const frame = await image.screenshot();
  await expect
    .poll(async () => (await image.screenshot()).equals(frame), {
      timeout: 2500,
      intervals: [70, 110, 170]
    })
    .toBe(false);
  await expect(playback.locator('button, canvas')).toHaveCount(0);
  await expect(playback).toHaveCSS('cursor', 'pointer');
  await expect(page.locator('dialog:visible')).toHaveCount(0);
  await expect(page.getByTestId('SendCount')).toHaveText('Отправлено: 1');
});
