import { expect, test, type Page, type Route } from '@playwright/test';
import { createServer } from 'node:http';

let VIDEO_BODY = Buffer.alloc(0);

const createPlayableVideo = async (page: Page): Promise<Buffer> => {
  const videoBytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext('2d')!;
    const stream = canvas.captureStream(15);
    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp8'
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = event => chunks.push(event.data);
    const stopped = new Promise<void>(resolve => {
      recorder.onstop = () => resolve();
    });
    recorder.start();
    for (let index = 0; index < 10; index++) {
      ctx.fillStyle = index % 2 ? 'green' : 'blue';
      ctx.fillRect(0, 0, 160, 90);
      await new Promise(resolve => setTimeout(resolve, 70));
    }
    recorder.stop();
    await stopped;
    stream.getTracks().forEach(track => track.stop());
    return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
  });
  return Buffer.from(videoBytes);
};
const WEBP_BODY = Buffer.from(
  'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
  'base64'
);

const createPdfBody = (): Buffer => {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream'
  ];
  let content = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(content));
    content += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(content);
  content += `xref\n0 ${objects.length + 1}\n`;
  content += '0000000000 65535 f \n';
  content += offsets
    .slice(1)
    .map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  content += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(content);
};

const PDF_BODY = createPdfBody();

test.setTimeout(60_000);

const openFixture = async (page: Page) => {
  await page.route('**/__slider-download', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body></body></html>'
    })
  );

  const serveVideo = async (route: Route) => {
    const range = route.request().headers().range;
    const downloadName = new URL(route.request().url()).searchParams.get(
      'downloadName'
    );

    await route.fulfill({
      status: range ? 206 : 200,
      contentType: 'video/webm',
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(VIDEO_BODY.length),
        ...(range
          ? {
              'Content-Range': `bytes 0-${VIDEO_BODY.length - 1}/${VIDEO_BODY.length}`
            }
          : {}),
        ...(downloadName
          ? {
              'Content-Disposition': `attachment; filename="${downloadName}"`
            }
          : {})
      },
      body: VIDEO_BODY
    });
  };

  await page.route('**/__slider-video-*.mp4*', serveVideo);
  await page.route('**/__slider-thumbnail-*.svg', route =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><rect width="16" height="9" fill="black"/></svg>'
    })
  );
  await page.goto('/__slider-download');
  if (!VIDEO_BODY.length) VIDEO_BODY = await createPlayableVideo(page);

  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    (window as any).sliderVideoFetches = [];
    window.fetch = (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;

      if (/__slider-video-\d+\.mp4(?:\?|$)/.test(url)) {
        (window as any).sliderVideoFetches.push(url);
      }

      return originalFetch(input, init);
    };
  });

  await page.evaluate(async () => {
    const fixture = await import(
      /* @vite-ignore */ '/e2e/fixtures/slider-download-harness.ts'
    );
    const items = Array.from({ length: 4 }, (_, index) => ({
      path: `${location.origin}/__slider-video-${index}.mp4`,
      fallbackPath: `${location.origin}/__slider-thumbnail-${index}.svg`,
      downloadPath: `${location.origin}/__slider-video-${index}.mp4?downloadName=slider-${index}.mp4`,
      name: `slider-${index}.mp4`
    }));

    (window as any).sliderDownloadFixture =
      await fixture.mountSliderDownloadFixture(items);
  });
};

test('SliderModal streams video and downloads through downloadPath without fetch blobs', async ({
  page
}) => {
  const videoRequests: Array<{ url: string; resourceType: string }> = [];
  page.on('request', request => {
    if (/__slider-video-\d+\.mp4(?:\?|$)/.test(request.url())) {
      videoRequests.push({
        url: request.url(),
        resourceType: request.resourceType()
      });
    }
  });

  await openFixture(page);
  const video = page.getByTestId('SliderDownloadRegression-Video');
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute('poster', /\/__slider-thumbnail-0\.svg$/);
  await expect
    .poll(() => page.evaluate(() => (window as any).sliderVideoFetches.length))
    .toBe(0);
  await expect
    .poll(
      () =>
        videoRequests.filter(request => request.resourceType === 'media').length
    )
    .toBeGreaterThan(0);
  expect(
    new Set(
      videoRequests
        .filter(request => request.resourceType === 'media')
        .map(request => new URL(request.url).pathname)
    )
  ).toEqual(new Set(['/__slider-video-0.mp4']));

  const downloadPromise = page.waitForEvent('download');
  await page
    .locator('.slider-modal__sub-nav:last-child .slider-modal__side-button')
    .first()
    .click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('slider-0.mp4');
  expect(new URL(download.url()).searchParams.get('downloadName')).toBe(
    'slider-0.mp4'
  );
  expect(await page.evaluate(() => (window as any).sliderVideoFetches)).toEqual(
    []
  );
});

test('SliderModal renders HEIC through a WebP preview and downloads the original', async ({
  page
}) => {
  const imageRequests: string[] = [];

  await page.route('**/__slider-heic', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body></body></html>'
    })
  );
  await page.route('**/__slider-photo.heic*', async route => {
    const url = new URL(route.request().url());
    imageRequests.push(url.toString());

    await route.fulfill({
      contentType:
        url.searchParams.get('preview') === 'webp'
          ? 'image/webp'
          : 'image/heic',
      headers: url.searchParams.has('downloadName')
        ? {
            'Content-Disposition': 'attachment; filename="original-photo.heic"'
          }
        : {},
      body: WEBP_BODY
    });
  });
  await page.goto('/__slider-heic');
  await page.evaluate(async () => {
    const fixture = await import(
      /* @vite-ignore */ '/e2e/fixtures/slider-download-harness.ts'
    );
    (window as any).sliderDownloadFixture =
      await fixture.mountSliderDownloadFixture([
        {
          path: `${location.origin}/__slider-photo.heic?preview=webp`,
          downloadPath: `${location.origin}/__slider-photo.heic?downloadName=original-photo.heic`,
          name: 'original-photo.heic'
        }
      ]);
  });

  await expect(
    page.locator('.slider-modal__image:not(.slider-modal__image_error)')
  ).toBeVisible();
  await expect
    .poll(() =>
      imageRequests.some(
        url => new URL(url).searchParams.get('preview') === 'webp'
      )
    )
    .toBe(true);

  const downloadPromise = page.waitForEvent('download');
  await page
    .locator('.slider-modal__sub-nav:last-child .slider-modal__side-button')
    .first()
    .click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('original-photo.heic');
  expect(new URL(download.url()).searchParams.get('preview')).toBeNull();
});

test('SliderModal coalesces concurrent PDF loading without application blobs', async ({
  page
}) => {
  let pdfRequests = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/__slider-document.pdf') {
      pdfRequests += 1;
    }
  });
  await page.route('**/__slider-pdf', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body></body></html>'
    })
  );
  await page.route('**/__slider-document.pdf*', async route => {
    // Keep the request in flight so the modal and preview consumers overlap.
    await new Promise(resolve => setTimeout(resolve, 100));
    await route.fulfill({
      contentType: 'application/pdf',
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(PDF_BODY.length)
      },
      body: PDF_BODY
    });
  });
  await page.goto('/__slider-pdf');
  await page.evaluate(async () => {
    const fixture = await import(
      /* @vite-ignore */ '/e2e/fixtures/slider-download-harness.ts'
    );
    (window as any).sliderDownloadFixture =
      await fixture.mountSliderDownloadFixture([
        {
          path: `${location.origin}/__slider-document.pdf`,
          downloadPath: `${location.origin}/__slider-document.pdf?downloadName=document.pdf`,
          name: 'document.pdf'
        }
      ]);
  });

  await expect(page.locator('.slider-modal__pdf').first()).toBeVisible();
  await expect.poll(() => pdfRequests).toBe(1);
});

test('Android-слайдер скачивает оригинальный HEIC через нативную загрузку', async ({
  page
}) => {
  await openFixture(page);
  await page.route('**/media/object/photo.heic*', route =>
    route.fulfill({ contentType: 'image/webp', body: WEBP_BODY })
  );
  await page.evaluate(async () => {
    (window as any).sliderDownloadFixture.unmount();
    (window as any).nativeDownloads = [];
    (window as any).__CHAT_NATIVE_FILE__ = {
      isAndroidNativePlatform: () => true,
      downloadFile: async (options: unknown) =>
        (window as any).nativeDownloads.push(options)
    };
    const fixture = await import('/e2e/fixtures/slider-download-harness.ts');
    (window as any).sliderDownloadFixture =
      await fixture.mountSliderDownloadFixture([
        {
          path: `${location.origin}/api/media/object/photo.heic?preview=webp`,
          downloadPath: `${location.origin}/api/media/object/photo.heic?downloadName=photo.heic`,
          name: 'photo.heic'
        }
      ]);
  });
  await page
    .locator('.slider-modal__sub-nav:last-child .slider-modal__side-button')
    .first()
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).nativeDownloads.length))
    .toBe(1);
  const downloads = await page.evaluate(() => (window as any).nativeDownloads);
  expect(new URL(downloads[0].url).searchParams.get('preview')).toBeNull();
  expect(downloads[0].fileName).toBe('photo.heic');
});

for (const headersOnly of [false, true]) {
  test(`скачивание большого файла начинается ${headersOnly ? 'по заголовкам, до первого байта' : 'до получения всего тела ответа'}`, async ({
    page
  }) => {
    let completed = false;
    let requested = 0;
    const server = createServer((req, res) => {
      requested++;
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="large-video.mp4"',
        ...(headersOnly ? { 'X-Content-Type-Options': 'nosniff' } : {}),
        'Content-Length': String(16 * 1024 * 1024)
      });
      if (headersOnly) {
        res.flushHeaders();
        return;
      }
      let bytes = 0;
      const timer = setInterval(() => {
        bytes += 64 * 1024;
        res.write(Buffer.alloc(64 * 1024));
        if (bytes === 16 * 1024 * 1024) {
          completed = true;
          clearInterval(timer);
          res.end();
        }
      }, 30);
      res.on('close', () => clearInterval(timer));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    try {
      await openFixture(page);
      await page.evaluate(async port => {
        (window as any).sliderDownloadFixture.unmount();
        const fixture = await import(
          '/e2e/fixtures/slider-download-harness.ts'
        );
        (window as any).sliderDownloadFixture =
          await fixture.mountSliderDownloadFixture([
            {
              path: `${location.origin}/__slider-thumbnail-0.svg`,
              downloadPath: `http://127.0.0.1:${port}/large-video.mp4`,
              name: 'large-video.mp4'
            }
          ]);
      }, address.port);
      const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
      await page
        .locator('.slider-modal__sub-nav:last-child .slider-modal__side-button')
        .first()
        .click();
      const download = await downloadPromise;
      expect(completed).toBe(false);
      expect(requested).toBe(1);
      expect(download.suggestedFilename()).toBe('large-video.mp4');
      await download.cancel();
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
}

test('скачивание начинается с первого клика, пока видеопревью не загрузилось', async ({
  page
}) => {
  let previewRequested = false;
  let releasePreview!: () => void;
  const previewGate = new Promise<void>(resolve => {
    releasePreview = resolve;
  });
  let markDownloadRequested!: () => void;
  const downloadRequested = new Promise<void>(resolve => {
    markDownloadRequested = resolve;
  });
  const server = createServer((_req, res) => {
    markDownloadRequested();
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Disposition': 'attachment; filename="preview-pending.mp4"',
      'Content-Length': String(16 * 1024 * 1024),
      'X-Content-Type-Options': 'nosniff'
    });
    res.flushHeaders();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };

  try {
    await page.route('**/__pending-video.mp4', async route => {
      previewRequested = true;
      await previewGate;
      await route.abort();
    });
    await openFixture(page);
    await page.evaluate(async port => {
      (window as any).sliderDownloadFixture.unmount();
      const fixture = await import('/e2e/fixtures/slider-download-harness.ts');
      (window as any).sliderDownloadFixture =
        await fixture.mountSliderDownloadFixture([
          {
            path: `${location.origin}/__pending-video.mp4`,
            downloadPath: `http://127.0.0.1:${port}/preview-pending.mp4`,
            name: 'preview-pending.mp4'
          }
        ]);
    }, address.port);
    await expect.poll(() => previewRequested).toBe(true);

    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
    await page
      .locator('.slider-modal__sub-nav:last-child .slider-modal__side-button')
      .first()
      .click();
    await Promise.race([
      downloadRequested,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Скачивание не началось за 1 секунду')),
          1000
        )
      )
    ]);
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('preview-pending.mp4');
    expect(previewRequested).toBe(true);
    await download.cancel();
  } finally {
    releasePreview();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('настоящее видео открывается с первой попытки, включая расширение в верхнем регистре', async ({
  page
}) => {
  await openFixture(page);
  const body = VIDEO_BODY;
  await page.route('**/__real-video.WEBM', route =>
    route.fulfill({ contentType: 'video/webm', body })
  );
  await page.route('**/__processing-video.mp4', route =>
    route.fulfill({ status: 404, body: '' })
  );
  await page.evaluate(async () => {
    (window as any).sliderDownloadFixture.unmount();
    const fixture = await import('/e2e/fixtures/slider-download-harness.ts');
    const { createLiveSliderItem } = await import(
      '/src/utils/live-slider-item.ts'
    );
    const { ref } = fixture;
    const processingPath = ref(`${location.origin}/__real-video.WEBM#t=0.1`);
    (window as any).startVideoProcessing = () => {
      processingPath.value = `${location.origin}/__processing-video.mp4`;
    };
    (window as any).finishVideoProcessing = () => {
      processingPath.value = `${location.origin}/__real-video.WEBM#t=0.1`;
    };
    (window as any).sliderDownloadFixture =
      await fixture.mountSliderDownloadFixture([
        createLiveSliderItem(() => ({
          path: processingPath.value,
          downloadPath: processingPath.value,
          name: 'recording.WEBM'
        }))
      ]);
  });
  const video = page.getByTestId('SliderDownloadRegression-Video');
  await expect(video).toBeVisible();
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.readyState)
    )
    .toBeGreaterThanOrEqual(2);
  expect(
    await video.evaluate((element: HTMLVideoElement) => ({
      error: element.error?.code ?? null,
      width: element.videoWidth
    }))
  ).toEqual({ error: null, width: 160 });
  await page.evaluate(() => (window as any).startVideoProcessing());
  await expect(page.locator('.slider-modal__image_error')).toBeVisible();
  await page.evaluate(() => (window as any).finishVideoProcessing());
  await expect(video).toBeVisible();
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.readyState)
    )
    .toBeGreaterThanOrEqual(2);
});

test('нажатие на второе видео в чате открывает его ровно один раз', async ({
  page
}) => {
  await openFixture(page);
  await page.evaluate(async () => {
    (window as any).sliderDownloadFixture.unmount();
    (window as any).openedMedia = [];
    const fixture = await import('/e2e/fixtures/slider-download-harness.ts');
    await fixture.mountMessageMediaFixture(index =>
      (window as any).openedMedia.push(index)
    );
  });
  await page.locator('.message-content__media-video').nth(1).click();
  expect(await page.evaluate(() => (window as any).openedMedia)).toEqual([1]);
});
