import { devices, expect, test, type Page } from '@playwright/test';
import { installTauriCallWindowMock } from './fixtures/tauri-call-window-mock';

// Проверки буфера требуют фокуса одного окна, без конкурирующих контекстов.
test.describe.configure({ mode: 'default', timeout: 60_000 });

test.use({
  viewport: { width: 1280, height: 800 },
  screen: { width: 1280, height: 800 },
  userAgent: devices['Desktop Chrome'].userAgent,
  isMobile: false,
  hasTouch: false
});

const roomId = 'e641f474-1b51-4cec-ac54-b9c752de8ed6';
const expectedUrl = `https://chat.pksep.ru/?callRoom=${roomId}&callInvite=local-clipboard-invite`;

async function openCall(page: Page) {
  const invites: string[] = [];
  await page.context().route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname))
      return route.abort();
    if (url.pathname === '/call-fixture-api/calls/invite-link') {
      invites.push(url.searchParams.get('roomId')!);
      return route.fulfill({
        json: {
          invite: {
            roomId,
            inviteToken: 'local-clipboard-invite'
          }
        }
      });
    }
    if (url.port === '5213' || url.pathname.startsWith('/call-fixture-api/'))
      return route.fulfill({
        json: [],
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    return route.continue();
  });
  await installTauriCallWindowMock(page);
  const opened = page.waitForEvent('popup');
  await page.goto(
    '/e2e/fixtures/desktop-call-window.html?review=1&participants=6&clipboard'
  );
  const popup = await opened;
  await popup.bringToFront();
  await expect(popup.locator('.call-modal__remote-tile')).toHaveCount(6);
  await page.evaluate(() => {
    (window as any).wrongClipboardCalls = 0;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          (window as any).wrongClipboardCalls++;
          throw new Error('Главное окно не в фокусе');
        }
      }
    });
    document.execCommand = () => {
      (window as any).wrongClipboardCalls++;
      return false;
    };
  });
  return { popup, invites };
}

async function openInfo(popup: Page, mobile: boolean) {
  await popup.setViewportSize(
    mobile ? { width: 330, height: 500 } : { width: 960, height: 720 }
  );
  await popup
    .getByRole('button', {
      name: mobile ? 'Открыть меню звонка' : 'Информация о звонке',
      exact: true
    })
    .click();
  if (mobile) await popup.getByText('Настройки', { exact: true }).click();
  await expect(
    popup.getByRole('button', { name: 'Скопировать ссылку', exact: true })
  ).toBeVisible();
}

for (const mobile of [false, true]) {
  test(`ссылка копируется из активного окна звонка, Clipboard API и fallback — ${mobile ? 'компактное' : 'обычное'}`, async ({
    page
  }) => {
    const { popup, invites } = await openCall(page);
    await popup.evaluate(() => {
      const win = window as any;
      win.clipboardWrites = [];
      win.copyFallback = [];
      win.denyClipboard = false;
      win.denyCopy = false;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            if (!document.hasFocus() || win.denyClipboard)
              throw new Error('Clipboard API недоступен');
            win.clipboardWrites.push(text);
          }
        }
      });
      document.execCommand = (command: string) => {
        if (win.denyCopy) return false;
        const field = document.activeElement as HTMLTextAreaElement;
        win.copyFallback.push({
          command,
          text: field.value,
          dialog: !!field.closest('dialog:modal'),
          focused: document.hasFocus()
        });
        return field.tagName === 'TEXTAREA';
      };
    });
    await openInfo(popup, mobile);
    const button = popup.getByRole('button', {
      name: 'Скопировать ссылку',
      exact: true
    });
    await button.click();
    await expect(
      popup
        .getByRole('status')
        .filter({ hasText: 'Ссылка на встречу скопирована' })
    ).toBeVisible();
    expect(await popup.evaluate(() => (window as any).clipboardWrites)).toEqual(
      [expectedUrl]
    );
    expect(invites).toEqual([roomId]);
    expect(await page.evaluate(() => (window as any).wrongClipboardCalls)).toBe(
      0
    );
    await popup.evaluate(() => {
      (window as any).denyClipboard = true;
    });
    await button.focus();
    await button.press('Enter');
    await expect
      .poll(() => popup.evaluate(() => (window as any).copyFallback))
      .toEqual([
        { command: 'copy', text: expectedUrl, dialog: mobile, focused: true }
      ]);
    await expect(button).toBeFocused();
    await expect(popup.locator('textarea')).toHaveCount(0);
    await popup.evaluate(() => {
      (window as any).denyCopy = true;
    });
    await button.click();
    await expect(popup.getByRole('alert')).toHaveText(
      'Не удалось скопировать ссылку. Попробуйте ещё раз.'
    );
    await expect(
      popup
        .getByRole('status')
        .filter({ hasText: 'Ссылка на встречу скопирована' })
    ).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).wrongClipboardCalls)).toBe(
      0
    );
    await popup.evaluate(() => {
      (window as any).denyClipboard = false;
    });
    await button.click();
    await expect(popup.getByRole('alert')).toHaveCount(0);
    await expect(
      popup
        .getByRole('status')
        .filter({ hasText: 'Ссылка на встречу скопирована' })
    ).toBeVisible();
  });
}

test('отдельное окно записывает публичную ссылку в настоящий буфер Chromium', async ({
  page,
  context,
  browserName
}, testInfo) => {
  test.skip(
    browserName !== 'chromium' || testInfo.project.name !== 'chromium-desktop',
    'Clipboard permission в desktop Chromium'
  );
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { popup } = await openCall(page);
  await openInfo(popup, false);
  await popup
    .getByRole('button', { name: 'Скопировать ссылку', exact: true })
    .click();
  await expect(
    popup
      .getByRole('status')
      .filter({ hasText: 'Ссылка на встречу скопирована' })
  ).toBeVisible();
  expect(await popup.evaluate(() => navigator.clipboard.readText())).toBe(
    expectedUrl
  );
  expect(await page.evaluate(() => (window as any).wrongClipboardCalls)).toBe(
    0
  );
});

test('копирование начинается при клике до ответа сервера, ошибка приглашения позволяет повторить', async ({
  page
}) => {
  const { popup } = await openCall(page);
  let releaseInvite!: () => void;
  const clipboardStarted = new Promise<void>(resolve => {
    releaseInvite = resolve;
  });
  let invalidInvite = false;
  await page.context().route('**/calls/invite-link?*', async route => {
    await clipboardStarted;
    await route.fulfill({
      json: {
        invite: invalidInvite
          ? null
          : { roomId, inviteToken: 'local-clipboard-invite' }
      }
    });
  });
  await popup.exposeFunction('clipboardStarted', releaseInvite);
  await popup.evaluate(() => {
    const win = window as any;
    win.clipboardWrites = [];
    win.gestureWrites = [];
    let clicking = false;
    document.addEventListener(
      'click',
      () => {
        clicking = true;
      },
      true
    );
    document.addEventListener('click', () => {
      clicking = false;
    });
    win.ClipboardItem = class {
      constructor(private types: Record<string, Promise<Blob>>) {}
      getType(type: string) {
        return this.types[type];
      }
    };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        write: async (items: ClipboardItem[]) => {
          win.gestureWrites.push(clicking && document.hasFocus());
          await win.clipboardStarted();
          const value = await items[0].getType('text/plain');
          win.clipboardWrites.push(await value.text());
        }
      }
    });
    document.execCommand = () => false;
  });
  await openInfo(popup, false);
  const button = popup.getByRole('button', {
    name: 'Скопировать ссылку',
    exact: true
  });
  await button.click();
  await expect(
    popup
      .getByRole('status')
      .filter({ hasText: 'Ссылка на встречу скопирована' })
  ).toBeVisible();
  expect(await popup.evaluate(() => (window as any).clipboardWrites)).toEqual([
    expectedUrl
  ]);
  invalidInvite = true;
  await button.click();
  await expect(popup.getByRole('alert')).toHaveText(
    'Не удалось скопировать ссылку. Попробуйте ещё раз.'
  );
  invalidInvite = false;
  await button.click();
  await expect(popup.getByRole('alert')).toHaveCount(0);
  expect(await popup.evaluate(() => (window as any).gestureWrites)).toEqual([
    true,
    true,
    true
  ]);
  expect(await page.evaluate(() => (window as any).wrongClipboardCalls)).toBe(
    0
  );
});
