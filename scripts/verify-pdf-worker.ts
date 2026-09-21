import { build, preview } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chromium, devices, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { externalizeUiKitPdfWorker } from './externalize-ui-kit-pdf-worker.ts';
import { lazyUiKitPdfRuntime } from './lazy-ui-kit-pdf-runtime.ts';

const outDir = resolve('../artifacts/chat-294-pdf-bundle');
await mkdir(outDir, { recursive: true });
// Две страницы с разной геометрией позволяют проверить настоящий рендер worker.
const drawing = '0 0 1 rg 0 0 50 50 re f\n';
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 5 0 R >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 200] /Contents 5 0 R >>',
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
await writeFile(resolve(outDir, 'sample.pdf'), pdf);
await build({
  configFile: false,
  plugins: [vue(), externalizeUiKitPdfWorker(), lazyUiKitPdfRuntime()],
  publicDir: false,
  build: {
    outDir,
    emptyOutDir: false,
    rollupOptions: {
      input: resolve('e2e/fixtures/pdf-worker.html'),
      output: { entryFileNames: 'assets/pdf-preview-fixture-[hash].js' }
    }
  }
});
const server = await preview({
  configFile: false,
  build: { outDir },
  preview: { host: '127.0.0.1', port: 5179, strictPort: true }
});
const browser = await chromium.launch();
console.log('Проверка PDF в production-сборке: браузер запущен');
const results: unknown[] = [];
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext(mobile ? devices['Pixel 5'] : {});
    const page = await context.newPage();
    const requests: string[] = [];
    const workers: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('worker', worker => workers.push(worker.url()));
    context.on('request', request => requests.push(request.url()));
    await page.goto('http://127.0.0.1:5179/e2e/fixtures/pdf-worker.html');
    await page.waitForTimeout(300);
    expect(
      requests.filter(url =>
        /\/assets\/(?:pdf-worker|_?chat-ui-pdf-runtime)-.*\.js$/.test(url)
      )
    ).toHaveLength(0);
    await page.getByRole('button', { name: 'PDF', exact: true }).click();
    const canvas = page.locator('canvas');
    const renderedPage = () =>
      canvas.evaluate((element: HTMLCanvasElement) => ({
        landscape: element.width > element.height,
        pixel: Array.from(
          element
            .getContext('2d')!
            .getImageData(
              Math.floor(element.width * 0.05),
              Math.floor(element.height * 0.95),
              1,
              1
            ).data
        )
      }));
    await expect(canvas).toBeVisible();
    await expect.poll(renderedPage).toEqual({
      landscape: true,
      pixel: [0, 0, 255, 255]
    });
    await page.locator('#next-page').click();
    await expect.poll(renderedPage).toEqual({
      landscape: false,
      pixel: [0, 0, 255, 255]
    });
    await page.getByRole('button', { name: 'PDF', exact: true }).click();
    await expect(canvas).toHaveCount(0);
    await page.getByRole('button', { name: 'PDF', exact: true }).click();
    await expect(canvas).toBeVisible();
    await expect.poll(renderedPage).toEqual({
      landscape: false,
      pixel: [0, 0, 255, 255]
    });
    expect(workers.some(url => /\/assets\/pdf-worker-.*\.js$/.test(url))).toBe(
      true
    );
    expect(
      requests.filter(url => /\/assets\/pdf-worker-.*\.js$/.test(url))
    ).toHaveLength(1);
    expect(errors).toEqual([]);
    expect(requests.filter(url => url.endsWith('/sample.pdf'))).toHaveLength(1);
    await expect(page.locator('#error')).toHaveText('');
    results.push({
      mobile,
      workerRequests: 1,
      startupWorkerRequests: 0,
      pagesRendered: 2,
      reopenedWithoutRequests: true,
      errors
    });
    await context.close();
  }
  await writeFile(
    resolve('../artifacts/chat-294-pdf-worker.json'),
    JSON.stringify(results, null, 2)
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await new Promise<void>(resolve => server.httpServer.close(() => resolve()));
}
