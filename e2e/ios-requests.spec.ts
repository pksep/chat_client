import { expect, test } from '@playwright/test';
import { openFixture, openTopic } from './fixtures/topic-performance-page';

test('iPhone PWA: папки сохраняют панель навигации, модалки занимают экран и учитывают safe area', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'webkit-iphone-pwa');
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addLocatorHandler(
    page.locator('dialog.ios-push-modal[open]'),
    async dialog => {
      await dialog.getByRole('button', { name: 'Позже', exact: true }).click();
    }
  );
  await page.goto('/e2e/fixtures/ios-pwa.html?kind=menu');
  await expect(page.locator('.menu-bottom-nav')).toBeVisible();
  await page.evaluate(async () => {
    document.documentElement.style.setProperty('--ios-safe-top', '59px');
    document.documentElement.style.setProperty('--ios-safe-bottom', '34px');
    (window as any).setIosViewport(844);
    const sdkPath = '/src/services/useChatSDK/index.ts';
    const { ChatSDK } = await import(/* @vite-ignore */ sdkPath);
    ChatSDK.prototype.connect = () => new Promise(() => {});
    const chatPath = '/src/services/useChat.ts';
    const { initializeChat, getChatSDK } = await import(
      /* @vite-ignore */ chatPath
    );
    await initializeChat({
      userId: 'ios-pwa-test-user',
      token: 'ios-folder-test',
      apiUrl: '/e2e/ios-api',
      wsUrl: 'ws://127.0.0.1:65530'
    });
    getChatSDK().getChatFolders = async () => [
      {
        id: 'iphone-folder',
        name: 'Работа',
        icon: 'paw',
        scope: 'chats',
        topicIds: ['iphone-chat-0'],
        position: 0,
        createdAt: '2026-10-23T00:00:00Z',
        updatedAt: '2026-10-23T00:00:00Z'
      }
    ];
    const path = '/src/composables/useChatFolders.ts';
    await (await import(/* @vite-ignore */ path))
      .useChatFolders()
      .loadFolders(true);
  });
  await expect(
    page.getByTestId('ChatFolders-Rail-Folder-iphone-folder')
  ).toBeVisible();
  await page.getByTestId('ChatFolders-Rail-Manage').click();
  const panel = page.getByTestId('ChatFolders-Panel');
  await expect(panel.getByTestId('ChatFolders-Rail-Manage')).toBeVisible();
  await expect(panel.getByTestId('ChatFolders-Rail-All')).toBeVisible();
  await panel.getByTestId('ChatFolders-CreateButton').click();
  const editor = page.locator('dialog.chat-folder-editor-mobile');
  await expect(editor).toBeVisible();
  const assertScreen = async (dialog: ReturnType<typeof page.locator>) => {
    await expect
      .poll(() =>
        dialog.evaluate(el =>
          el
            .getAnimations({ subtree: true })
            .some(animation => animation.playState === 'running')
        )
      )
      .toBe(false);
    await expect
      .poll(async () => {
        const box = (await dialog.boundingBox())!;
        return [Math.round(box.y), Math.round(box.height)];
      })
      .toEqual([0, 844]);
    const header = dialog
      .locator('.mobile__modal-header, .chat-folder-details__header')
      .first();
    expect((await header.boundingBox())!.y).toBeGreaterThanOrEqual(59);
    expect((await header.boundingBox())!.y).toBeLessThanOrEqual(109);
  };
  await assertScreen(editor);
  await page
    .getByTestId('ChatFolders-NameInput')
    .locator('input')
    .fill('Новая');
  const row = editor.locator('[data-topic-id="iphone-chat-0"]');
  await row.click();
  await expect(row).toHaveClass(/menu-list-row--active/);
  const rowBox = (await row.boundingBox())!;
  expect(rowBox.x).toBe(0);
  expect(rowBox.width).toBe(390);
  const search = editor.getByTestId('ChatFolders-TopicSearch').locator('input');
  await editor.getByTestId('ChatFolders-NameInput').locator('input').blur();
  await expect(search).toHaveCSS(
    'background-color',
    await editor
      .getByTestId('ChatFolders-NameInput')
      .evaluate(el => getComputedStyle(el).backgroundColor)
  );
  const saveBox = (await editor
    .getByTestId('ChatFolders-SaveButton')
    .boundingBox())!;
  expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(810);
  await page.screenshot({
    path: testInfo.outputPath('iphone-folder-editor.png'),
    animations: 'disabled'
  });
  await editor.getByRole('button', { name: 'Назад', exact: true }).click();
  await page.getByTestId('ChatFolders-Folder-iphone-folder').click();
  const details = page.locator('dialog.chat-folder-details-modal');
  await assertScreen(details);
  await page.getByTestId('ChatFolders-IconButton').click();
  await expect(page.getByTestId('ChatFolders-Icon-paw')).toBeVisible();
  await assertScreen(details);
  await page.screenshot({
    path: testInfo.outputPath('iphone-folder-details.png'),
    animations: 'disabled'
  });
  await assertScreen(details);
  await details.getByRole('button', { name: 'Назад', exact: true }).click();
  await panel.getByTestId('ChatFolders-Rail-All').click();
  await page.locator('.chats-toolbar__create-button').click();
  await page.getByRole('button', { name: 'Создать бота', exact: true }).click();
  const bot = page.locator('dialog.new-bot-mobile');
  await assertScreen(bot);
  const botHeader = (await bot.locator('.mobile__modal-header').boundingBox())!;
  const botAvatar = (await bot
    .locator('.bot-editor__avatar-button')
    .boundingBox())!;
  expect(botAvatar.y - botHeader.y - botHeader.height).toBeGreaterThanOrEqual(
    10
  );
  expect(botAvatar.y - botHeader.y - botHeader.height).toBeLessThanOrEqual(35);
  await page.screenshot({
    path: testInfo.outputPath('iphone-bot-modal.png'),
    animations: 'disabled'
  });
  await assertScreen(bot);
  const submitBox = (await bot
    .getByRole('button', { name: 'Создать', exact: true })
    .boundingBox())!;
  expect(submitBox.y + submitBox.height).toBeLessThanOrEqual(810);
  expect(errors).toEqual([]);
});

test.beforeEach(async ({ page }, testInfo) => {
  await page.route('**/*', route => {
    const hostname = new URL(route.request().url()).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1'
      ? route.fallback()
      : route.abort();
  });
  if (testInfo.project.name === 'webkit-iphone-pwa') {
    await page.addInitScript(viewportHeight => {
      Object.defineProperty(navigator, 'standalone', { value: true });
      let height = viewportHeight;
      let top = 0;
      Object.defineProperties(visualViewport!, {
        height: { get: () => height },
        offsetTop: { get: () => top }
      });
      (window as any).setIosViewport = (nextHeight: number, nextTop = 0) => {
        height = nextHeight;
        top = nextTop;
        visualViewport!.dispatchEvent(new Event('resize'));
      };
    }, testInfo.project.use.viewport!.height);
  }
  await page.route('**/e2e/ios-api/**', route => {
    if (/\/(image.png|IMG_8538.jpeg)(?:\?|$)/.test(route.request().url()))
      return route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="coral"/></svg>'
      });
    if (route.request().url().includes('missing-'))
      return route.fulfill({ status: 404 });
    return route.fulfill({
      json: { data: [], items: [], nextCursor: null, hasMore: false }
    });
  });
});

test('PWA: ссылка, логин и пароль доступны над клавиатурой', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'webkit-iphone-pwa');
  await page.goto('/e2e/fixtures/ios-requests.html?kind=auth');
  const link = page.locator('#chat-server-url input');
  const url = (await link.count()) ? link : page.locator('input').first();
  await url.fill('chat.example');
  await page.evaluate(() => (window as any).setIosViewport(390));
  await expect
    .poll(() =>
      url.evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= visualViewport!.height;
      })
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  const password = page.locator('input[type="password"]');
  await password.fill('test-password');
  for (const [height, top] of [
    [360, 0],
    [360, 100],
    [500, 0]
  ]) {
    await page.evaluate(
      ([h, t]) => (window as any).setIosViewport(h, t),
      [height, top]
    );
    await expect
      .poll(() =>
        password.evaluate(el => {
          const r = el.getBoundingClientRect();
          return (
            r.top >= visualViewport!.offsetTop &&
            r.bottom <= visualViewport!.offsetTop + visualViewport!.height
          );
        })
      )
      .toBe(true);
    await expect(password).toBeFocused();
  }
  await page.screenshot({ path: testInfo.outputPath('auth-keyboard.png') });
});

test('свайп участников перелистывает страницы без выбора плитки; вертикаль и два пальца сохраняются', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/ios-requests.html?kind=participants');
  const grid = page.locator('.call-modal__remote-grid');
  await expect(grid).toBeVisible();
  const swipe = async (
    dx: number,
    dy: number,
    cancel = false,
    multitouch = false
  ) =>
    grid.evaluate(
      (el, { dx, dy, cancel, multitouch }) => {
        const makeTouch = (x: number, y: number, identifier = 1) => ({
          identifier,
          target: el,
          clientX: x,
          clientY: y
        });
        const dispatch = (
          type: string,
          touches: object[],
          changed: object[]
        ) => {
          const event = new Event(type, { bubbles: true, cancelable: true });
          Object.defineProperties(event, {
            touches: { value: touches },
            changedTouches: { value: changed }
          });
          el.dispatchEvent(event);
        };
        const start = makeTouch(200, 200);
        const end = makeTouch(200 + dx, 200 + dy);
        dispatch('touchstart', [start], [start]);
        dispatch(
          'touchmove',
          multitouch ? [end, makeTouch(250, 200, 2)] : [end],
          [end]
        );
        dispatch(cancel ? 'touchcancel' : 'touchend', [], [end]);
      },
      { dx, dy, cancel, multitouch }
    );
  const pageIndicator = page.getByTestId('page');
  await swipe(-100, 5);
  await expect(pageIndicator).toHaveText('1:');
  await grid.locator('.call-modal__remote-tile').first().dispatchEvent('click');
  await expect(pageIndicator).toHaveText('1:');
  await swipe(-100, 0);
  await expect(pageIndicator).toHaveText('1:');
  await swipe(100, 0);
  await expect(pageIndicator).toHaveText('0:');
  for (const [dx, dy, cancel, multi] of [
    [-20, 0, false, false],
    [-100, 160, false, false],
    [-100, 0, true, false],
    [-100, 0, false, true]
  ] as const) {
    await swipe(dx, dy, cancel, multi);
    await expect(pageIndicator).toHaveText('0:');
  }
  await page.getByRole('button').last().click();
  await expect(pageIndicator).toHaveText('1:');
});

test('PNG и JPEG в медиа открываются через оригинал при битом превью и старом blob', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/ios-requests.html?kind=attachments');
  const images = page.locator('.profile-attachments__media-tile img');
  await expect(images).toHaveCount(2);
  await expect
    .poll(() =>
      images.evaluateAll(els =>
        els.every(el => (el as HTMLImageElement).naturalWidth === 80)
      )
    )
    .toBe(true);
});

test('фото с камеры не ждёт бесконечно размер миниатюры', async ({ page }) => {
  await page.goto('/e2e/fixtures/ios-requests.html?kind=participants');
  const result = await page.evaluate(async () => {
    const OriginalImage = window.Image;
    window.Image = class {
      onload = null;
      onerror = null;
      src = '';
    } as any;
    try {
      const { getImageDimensions } = await import('/src/utils/mediaPreview.ts');
      return await getImageDimensions(
        new File(['camera'], 'IMG_1234.jpeg', { type: 'image/jpeg' })
      );
    } finally {
      window.Image = OriginalImage;
    }
  });
  expect(result).toEqual({});
});

test('на мобильном Ответить сразу фокусирует редактор с разрешённой клавиатурой', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-desktop');
  await page.goto('/e2e/fixtures/ios-pwa.html?kind=group&no-pinned');
  const editor = page.locator('.chat__input .ProseMirror');
  await expect(editor).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.chat__input--booting')).toHaveCount(0);
  await expect(editor).toBeInViewport();
  await page.locator('.chat__input .smile-button:visible').tap();
  await expect(editor).toHaveAttribute('inputmode', 'none');
  const row = page.locator('.message[data-message-id="message-39"]');
  await row.evaluate(el => {
    el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    const point = el.getBoundingClientRect();
    el.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: point.x + 40,
        clientY: point.y + 12
      })
    );
  });
  const reply = page
    .locator('.message-context-menu:visible')
    .getByRole('button', { name: 'Ответить', exact: true });
  await expect(reply).toBeVisible();
  await reply.tap();
  await expect(editor).toBeFocused();
  await expect(editor).not.toHaveAttribute('inputmode', 'none');
  await expect(page.locator('.chat__input')).toContainText('В ответ');
});

test('после возврата PWA зависшая передача освобождается для повторной отправки', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'webkit-iphone-pwa');
  await page.goto('/e2e/fixtures/ios-requests.html?kind=participants');
  const result = await page.evaluate(async () => {
    const { watchIosUpload } = await import(
      '/src/utils/ios-upload-watchdog.ts'
    );
    let now = 1000;
    const originalNow = Date.now;
    Date.now = () => now;
    let hidden = false;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden
    });
    let aborted = 0;
    const xhr = new EventTarget() as XMLHttpRequest;
    Object.defineProperties(xhr, {
      upload: { value: new EventTarget() },
      abort: {
        value: () => {
          aborted++;
          xhr.dispatchEvent(new Event('loadend'));
        }
      }
    });
    const cleanup = watchIosUpload(xhr);
    try {
      now += 25_000;
      xhr.upload.dispatchEvent(new Event('progress'));
      hidden = true;
      document.dispatchEvent(new Event('visibilitychange'));
      now += 90_000;
      const duringBackground = aborted;
      hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
      document.dispatchEvent(new Event('visibilitychange'));
      return { duringBackground, afterResume: aborted };
    } finally {
      cleanup();
      Date.now = originalNow;
    }
  });
  expect(result).toEqual({ duringBackground: 0, afterResume: 1 });
});

test('фото отправляется даже если WebKit не декодировал локальную миниатюру', async ({
  page
}) => {
  await openFixture(page, { count: 1 });
  await openTopic(page, 0);
  await expect(page.locator('.chat__input--booting')).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const fixture = (window as any).topicPerformance;
    const { controlConnection } = await import(
      '/e2e/fixtures/network-harness.ts'
    );
    const { mountMessageSender } = await import(
      '/e2e/fixtures/message-send-harness.ts'
    );
    controlConnection();
    const sent: any[] = [];
    fixture.sdk.sendWebSocketEvent = (type: string, payload: any) => {
      if (payload.medias) sent.push(payload);
      return true;
    };
    fixture.sdk.uploadFile = async () => ({
      objectName: 'camera.jpeg',
      thumbnailObjectName: null
    });
    const originalImage = window.Image;
    window.Image = class {
      onload = null;
      onerror = null;
      src = '';
    } as any;
    const sender = mountMessageSender('performance-0');
    try {
      await sender.handleAttachSharedFiles([
        new File(['camera'], 'IMG_1234.jpeg', { type: 'image/jpeg' })
      ]);
      return sent.map(row =>
        row.medias.map((media: any) => ({ path: media.path, type: media.type }))
      );
    } finally {
      window.Image = originalImage;
      sender.stop();
    }
  });
  expect(result).toEqual([[{ path: 'camera.jpeg', type: 'IMAGE' }]]);
});

test('фото в очереди iPhone сохраняет байты и имя после перезапуска', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'webkit-iphone-pwa');
  await page.goto('/e2e/fixtures/ios-requests.html?kind=participants');
  await page.evaluate(async () => {
    const cache = await import('/src/services/useTopicMessagesCache.ts');
    await cache.savePendingUploadFile({
      topicId: 'camera',
      messageId: 'camera-message',
      fileId: '0',
      userId: 'camera-user',
      isMedia: true,
      file: new File([new Uint8Array([19, 73, 241])], 'IMG_1234.jpeg', {
        type: 'image/jpeg',
        lastModified: 12345
      })
    });
  });
  await page.reload();
  expect(
    await page.evaluate(async () => {
      const cache = await import('/src/services/useTopicMessagesCache.ts');
      const record = await cache.loadPendingUploadFile(
        'camera',
        'camera-message',
        '0',
        'camera-user'
      );
      if (!record) return null;
      return {
        name: record.file.name,
        type: record.file.type,
        lastModified: record.file.lastModified,
        isMedia: record.isMedia,
        bytes: [...new Uint8Array(await record.file.arrayBuffer())]
      };
    })
  ).toEqual({
    name: 'IMG_1234.jpeg',
    type: 'image/jpeg',
    lastModified: 12345,
    isMedia: true,
    bytes: [19, 73, 241]
  });
});

test('PWA автоматически продолжает прерванную загрузку после возврата без дубликата сообщения', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'webkit-iphone-pwa');
  await openFixture(page, { count: 1 });
  await openTopic(page, 0);
  await expect(page.locator('.chat__input--booting')).toHaveCount(0);
  await page.evaluate(async () => {
    const fixture = (window as any).topicPerformance;
    const { controlConnection } = await import(
      '/e2e/fixtures/network-harness.ts'
    );
    const { mountMessageSender } = await import(
      '/e2e/fixtures/message-send-harness.ts'
    );
    controlConnection();
    let hidden = false;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden
    });
    const state = {
      attempts: 0,
      sent: [] as any[],
      reject: () => {},
      resume: () => {
        hidden = false;
        document.dispatchEvent(new Event('visibilitychange'));
      }
    };
    (window as any).uploadRegression = state;
    fixture.sdk.sendWebSocketEvent = (_type: string, payload: any) => {
      if (payload.medias) state.sent.push(payload);
      return true;
    };
    fixture.sdk.uploadFile = async () => {
      state.attempts++;
      if (state.attempts === 1)
        return new Promise((_resolve, reject) => {
          state.reject = () => {
            hidden = true;
            document.dispatchEvent(new Event('visibilitychange'));
            reject(new Error('PWA suspended'));
          };
        });
      return { objectName: 'resumed.jpeg', thumbnailObjectName: null };
    };
    (window as any).retrySender = mountMessageSender('performance-0');
    (window as any).uploadDone = (
      window as any
    ).retrySender.handleAttachSharedFiles([
      new File(['camera'], 'IMG_8538.jpeg', { type: 'image/jpeg' })
    ]);
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).uploadRegression.attempts))
    .toBe(1);
  await page.evaluate(async () => {
    (window as any).uploadRegression.reject();
    await (window as any).uploadDone;
    (window as any).uploadRegression.resume();
  });
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).uploadRegression.sent.length)
    )
    .toBe(1);
  expect(
    await page.evaluate(() => {
      const fixture = (window as any).topicPerformance;
      const messages = fixture.messages
        .getFullMessagesByTopicId('performance-0')
        .filter((m: any) => m.senderUserId === 'performance-user');
      return {
        attempts: (window as any).uploadRegression.attempts,
        count: messages.length,
        path: messages[0].media[0].path
      };
    })
  ).toEqual({ attempts: 2, count: 1, path: 'resumed.jpeg' });
});

test('возврат в звонок возобновляет остановленный звук и не перезапускает играющий поток', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    // Windows WebKit не предоставляет WebRTC; проверяем привязку и жизненный
    // цикл элемента на тестовом потоке, не подключаясь к комнате звонка.
    if (typeof MediaStream !== 'function') {
      window.MediaStream = class {
        id = 'test-audio';
        constructor() {
          Object.freeze(this);
        }
        getTracks() {
          return [];
        }
        getAudioTracks() {
          return [];
        }
        getVideoTracks() {
          return [];
        }
      } as any;
      const streams = new WeakMap<HTMLMediaElement, MediaStream>();
      Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
        configurable: true,
        get() {
          return streams.get(this) || null;
        },
        set(stream) {
          streams.set(this, stream);
        }
      });
    }
    const playing = new WeakSet<HTMLMediaElement>();
    const calls = new WeakMap<HTMLMediaElement, number>();
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
      configurable: true,
      get() {
        return !playing.has(this);
      }
    });
    HTMLMediaElement.prototype.play = function () {
      playing.add(this);
      calls.set(this, (calls.get(this) || 0) + 1);
      return Promise.resolve();
    };
    (window as any).audioRegression = { playing, calls };
  });
  await page.goto('/e2e/fixtures/ios-requests.html?kind=call', {
    waitUntil: 'domcontentloaded'
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).iosRequestsReady), {
      timeout: 60_000
    })
    .toBe(true);
  expect(errors).toEqual([]);
  await page.evaluate(async () => {
    const call = await import('/src/services/useCallState.ts');
    const stream = new MediaStream();
    (window as any).callStream = stream;
    call.user.value = { id: 'peer', initials: 'Тест' } as any;
    call.remoteParticipants.value = [
      {
        identity: 'peer',
        name: 'Тест',
        audioStream: stream as MediaStream,
        videoStream: null,
        cameraStream: null,
        screenShareStream: null,
        isMicActive: true,
        isVideoActive: false,
        isScreenShareActive: false,
        isHandRaised: false,
        activeReaction: null,
        activeReactionExpiresAt: null,
        isSpeaking: false,
        audioLevel: 0,
        connectionQuality: 'excellent'
      }
    ];
    call.open.value = true;
    call.isModalVisible.value = true;
  });
  const audio = page.locator('.call-modal__remote-audio-layer audio');
  await expect
    .poll(async () => ({ count: await audio.count(), errors }))
    .toEqual({ count: 1, errors: [] });
  const initial = await audio.evaluate(el =>
    (window as any).audioRegression.calls.get(el)
  );
  expect(initial).toBeGreaterThan(0);
  const result = await audio.evaluate(async el => {
    const state = (window as any).audioRegression;
    const call = await import('/src/services/useCallState.ts');
    const { nextTick } = await import('/e2e/fixtures/network-harness.ts');
    call.remoteParticipants.value[0].audioLevel = 0.8;
    await nextTick();
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pageshow'));
    const whilePlaying = state.calls.get(el);
    state.playing.delete(el);
    let hidden = true;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden
    });
    document.dispatchEvent(new Event('visibilitychange'));
    const inBackground = state.calls.get(el);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pageshow'));
    return {
      whilePlaying,
      inBackground,
      resumed: state.calls.get(el),
      sameStream:
        (el as HTMLMediaElement).srcObject === (window as any).callStream
    };
  });
  expect(result).toEqual({
    whilePlaying: initial,
    inBackground: initial,
    resumed: initial + 1,
    sameStream: true
  });
  expect(errors).toEqual([]);
});
