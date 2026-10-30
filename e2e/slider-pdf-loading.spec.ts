import { expect, test, type Page } from '@playwright/test';

const pageErrors = new WeakMap<Page, string[]>();

const drawing = '0 0 1 rg 0 0 100 100 re f\n';
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>',
  `<< /Length ${Buffer.byteLength(drawing)} >>\nstream\n${drawing}endstream`
];
let pdf = '%PDF-1.4\n';
const offsets = [0];
objects.forEach((object, index) => {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
});
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
for (const offset of offsets.slice(1))
  pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

test.beforeEach(async ({ page }, testInfo) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  if (testInfo.project.name === 'webkit-iphone-pwa') {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', { value: true });
    });
  }
  await page.route('**/__review.svg', route =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="coral"/></svg>'
    })
  );
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

test('лоудер PDF виден до отрисовки страницы; панель и Назад остаются внутри экрана', async ({
  page
}, testInfo) => {
  test.setTimeout(60_000);
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/__review.pdf', async route => {
    await pending;
    await route.fulfill({ contentType: 'application/pdf', body: pdf });
  });
  try {
    await page.goto('/e2e/fixtures/slider-pdf-loading.html');
    const loader = page.getByRole('status', { name: 'Загрузка PDF' });
    await expect(loader).toBeVisible({ timeout: 60_000 });
    const isPwa = testInfo.project.name === 'webkit-iphone-pwa';
    if (isPwa)
      await page.evaluate(() => {
        document.documentElement.style.setProperty('--ios-safe-top', '47px');
        document.documentElement.style.setProperty('--ios-safe-bottom', '34px');
      });
    const viewport = page.viewportSize()!;
    if (viewport.width <= 768) {
      await expect
        .poll(() =>
          page.locator('.slider-modal__content').evaluate(element => {
            const header = element
              .querySelector('.slider-modal__mobile-header')!
              .getBoundingClientRect();
            const name = element
              .querySelector('.slider-modal__name')!
              .getBoundingClientRect();
            return name.top - header.bottom;
          })
        )
        .toBeLessThanOrEqual(1);
    }
    const spinner = page.locator('.slider-modal__loading-spinner');
    await expect(spinner).toHaveCSS('width', '64px');
    await expect(spinner).toHaveCSS('height', '64px');
    await page.screenshot({
      path: testInfo.outputPath('pdf-loading.png'),
      animations: 'disabled'
    });
    release();
    await expect(loader).toHaveCount(0, { timeout: 30_000 });
    const canvas = page.locator('.slider-modal__item canvas').first();
    await expect
      .poll(() =>
        canvas.evaluate((el: HTMLCanvasElement) => [
          ...el
            .getContext('2d')!
            .getImageData(el.width / 4, (el.height * 3) / 4, 1, 1).data
        ])
      )
      .toEqual([0, 0, 255, 255]);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect
      .poll(
        async () => (await page.locator('.slider-modal__name').boundingBox())!.y
      )
      .toBeGreaterThanOrEqual(0);
    await page.screenshot({
      path: testInfo.outputPath('pdf-loaded.png'),
      animations: 'disabled'
    });
    if (testInfo.project.name !== 'chromium-desktop') {
      const back = (await page
        .locator('.slider-modal__exit-button')
        .boundingBox())!;
      expect(back.y).toBeGreaterThanOrEqual(isPwa ? 47 : 0);
      const bottom = (await page
        .locator('.slider-modal__bottom')
        .boundingBox())!;
      expect(bottom.y + bottom.height).toBeCloseTo(
        viewport.height - (isPwa ? 34 : 0),
        0
      );
      const buttons = page.locator(
        '.slider-modal__nav-block:nth-child(3) button:visible'
      );
      await expect(buttons).toHaveCount(3);
      for (const button of await buttons.all()) {
        const bounds = (await button.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      }
      await page.locator('.slider-modal__exit-button').click();
    } else await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally {
    release();
  }
});

test('ошибка PDF убирает лоудер и показывает ошибку', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route('**/__review.pdf', route =>
    route.fulfill({ status: 404, body: '' })
  );
  await page.goto('/e2e/fixtures/slider-pdf-loading.html');
  await expect(page.getByRole('alert')).toHaveText('Не удалось загрузить PDF', {
    timeout: 30_000
  });
  await expect(page.getByRole('status', { name: 'Загрузка PDF' })).toHaveCount(
    0
  );
});

test('слайдер заполняет изменившийся viewport iPhone без нижней полосы', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'webkit-iphone-pwa');
  await page.route('**/__review.pdf', route =>
    route.fulfill({ contentType: 'application/pdf', body: pdf })
  );
  await page.goto('/e2e/fixtures/slider-pdf-loading.html');
  await expect(page.locator('dialog.slider-modal')).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--ios-safe-top', '47px');
    document.documentElement.style.setProperty('--ios-safe-bottom', '34px');
    const viewport = window.visualViewport!;
    Object.defineProperties(viewport, {
      height: { configurable: true, get: () => 500 },
      offsetTop: { configurable: true, get: () => 180 }
    });
    viewport.dispatchEvent(new Event('resize'));
  });
  const dialog = page.locator('dialog.slider-modal');
  await expect
    .poll(async () => {
      const box = (await dialog.boundingBox())!;
      return [box.y, box.height];
    })
    .toEqual([180, 500]);
  const bottom = (await page.locator('.slider-modal__bottom').boundingBox())!;
  expect(bottom.y + bottom.height).toBeCloseTo(680 - 34, 0);
  await page.screenshot({
    path: testInfo.outputPath('ios-slider-resized.png'),
    animations: 'disabled'
  });
  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    Object.defineProperties(viewport, {
      height: { get: () => window.innerHeight },
      offsetTop: { get: () => 0 }
    });
    viewport.dispatchEvent(new Event('resize'));
  });
  await expect
    .poll(async () => {
      const box = (await dialog.boundingBox())!;
      return [box.y, box.height];
    })
    .toEqual([0, page.viewportSize()!.height]);
  const restoredBottom = (await page
    .locator('.slider-modal__bottom')
    .boundingBox())!;
  expect(restoredBottom.y + restoredBottom.height).toBeCloseTo(
    page.viewportSize()!.height - 34,
    0
  );
});

test('поздняя ошибка предыдущего PDF не меняет открытое изображение', async ({
  page
}) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  let fulfilled!: () => void;
  const completed = new Promise<void>(resolve => {
    fulfilled = resolve;
  });
  await page.route('**/__review.pdf', async route => {
    await pending;
    await route.fulfill({ status: 404, body: '' });
    fulfilled();
  });
  try {
    await page.goto('/e2e/fixtures/slider-pdf-loading.html');
    await expect(
      page.getByRole('status', { name: 'Загрузка PDF' })
    ).toBeVisible();
    await page.locator('.slider-modal__slide').nth(1).click();
    await expect(page.locator('.slider-modal__name')).toHaveText(
      'Изображение.svg'
    );
    release();
    await completed;
    await expect(page.locator('.slider-modal__image_positioned')).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally {
    release();
  }
});

test('просмотрщик можно закрыть, пока PDF ещё загружается', async ({
  page
}, testInfo) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/__review.pdf', async route => {
    await pending;
    await route.fulfill({ contentType: 'application/pdf', body: pdf });
  });
  try {
    await page.goto('/e2e/fixtures/slider-pdf-loading.html');
    await expect(
      page.getByRole('status', { name: 'Загрузка PDF' })
    ).toBeVisible();
    if (testInfo.project.name === 'chromium-desktop')
      await page.keyboard.press('Escape');
    else await page.locator('.slider-modal__exit-button').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally {
    release();
  }
});
