import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import type { ChatFolder } from '../src/services/useChatSDK/chat-folder';

test.skip(
  process.env.PKSEP_AI_FOLDERS_LIVE !== 'true',
  'Нужен явно включённый локальный стенд Chat'
);
test.setTimeout(150000);

const base = 'http://127.0.0.1:5174';
const api = 'http://127.0.0.1:5001/api/chat-folders';
const aiUrl = `${base}/ai?organization=${encodeURIComponent(`${base}/.runtime.local`)}`;

test('личная папка содержит чаты и задачи, сохраняется и синхронизируется между вкладками', async ({
  page,
  context
}) => {
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const name = `ИИ QA ${randomUUID().slice(0, 6)}`;
  const titles = ['Чат А QA', 'Задача QA', 'Чат Б QA', 'Чат В QA'];
  const sessions = ids.map((id, index) => ({
    id,
    title: titles[index],
    description: 'Проверка папок',
    kind: index === 1 ? 'task' : 'chat',
    time: '15:00',
    messages: []
  }));
  await context.addInitScript(sessions => {
    localStorage.setItem(
      'sep:chat:ai-assistant:v1',
      JSON.stringify({
        sessions,
        tasks: [],
        permissionMode: 'ask',
        responseMode: 'quick'
      })
    );
  }, sessions);
  const pageErrors: string[] = [];
  page.on('pageerror', error => {
    pageErrors.push(error.message);
  });
  let folderId: string | undefined;
  let token = '';

  const openAi = async (target: Page): Promise<void> => {
    await target.goto(aiUrl);
    if ((target.viewportSize()?.width ?? 1000) < 768) {
      await expect(
        target.getByRole('button', { name: 'Остаться в браузере', exact: true })
      ).toBeVisible({ timeout: 15000 });
      await target
        .getByRole('button', { name: 'Остаться в браузере', exact: true })
        .click();
      await target.getByRole('button', { name: 'Назад', exact: true }).click();
    }
    await target
      .locator('[data-testid$="MenuBottomNav-AI"]:visible')
      .click({ timeout: 60000 });
    await expect(
      target.getByRole('heading', { name: 'ИИ-Ассистент', exact: true })
    ).toBeVisible({ timeout: 60000 });
  };

  try {
    await openAi(page);
    token = await page.evaluate(
      () => JSON.parse(localStorage.getItem('chat_auth_session') || '{}').token
    );
    const headers = { Authorization: `Bearer ${token}` };
    if ((page.viewportSize()?.width ?? 1000) < 768)
      await page.getByTestId('AI-MenuPanel-FoldersButton').click();
    else
      await page
        .locator('[data-testid="ChatFolders-Rail-Manage"]:visible')
        .click();
    await page.getByTestId('ChatFolders-CreateButton').click();
    const field = page.locator('[data-testid="ChatFolders-NameInput"]:visible');
    if ((await field.evaluate(element => element.tagName)) === 'INPUT')
      await field.fill(name);
    else await field.locator('input').fill(name);
    await page.getByTestId(`AI-FolderChoice-session:${ids[0]}`).click();
    await page.getByTestId('ChatFolders-TopicFilters-Filter-tasks').click();
    await page.getByTestId(`AI-FolderChoice-session:${ids[1]}`).click();
    await page
      .locator('[data-testid="ChatFolders-SaveButton"]:visible')
      .click();
    await expect(field).not.toBeVisible();

    const folders: ChatFolder[] = await (
      await page.request.get(api, { headers })
    ).json();
    const folder = folders.find(
      item => item.name === name && item.scope === 'ai'
    );
    expect(folder).toBeTruthy();
    folderId = folder!.id;
    expect(folder!.topicIds).toEqual([]);
    expect(folder!.aiItems).toEqual(
      expect.arrayContaining([
        { type: 'session', id: ids[0] },
        { type: 'session', id: ids[1] }
      ])
    );

    const select = async (target: Page): Promise<void> => {
      await target
        .locator(`[data-testid="ChatFolders-Rail-Folder-${folderId}"]:visible`)
        .click();
    };
    await select(page);
    await expect(
      page.getByRole('heading', { name, exact: true })
    ).toBeVisible();
    await expect(page.getByText(titles[0], { exact: true })).toBeVisible();
    await expect(page.getByText(titles[2], { exact: true })).not.toBeVisible();
    await page.getByRole('tab', { name: 'Задачи', exact: true }).click();
    await expect(page.getByText(titles[1], { exact: true })).toBeVisible();
    await page.reload();
    if ((page.viewportSize()?.width ?? 1000) < 768) {
      await expect(
        page.getByRole('button', { name: 'Остаться в браузере', exact: true })
      ).toBeVisible({ timeout: 15000 });
      await page
        .getByRole('button', { name: 'Остаться в браузере', exact: true })
        .click();
    }
    await expect(
      page.locator(
        `[data-testid="ChatFolders-Rail-Folder-${folderId}"]:visible`
      )
    ).toBeVisible({ timeout: 60000 });
    await select(page);
    await page.getByRole('tab', { name: 'Задачи', exact: true }).click();
    await expect(page.getByText(titles[1], { exact: true })).toBeVisible();

    const second = await context.newPage();
    await openAi(second);
    await select(second);
    await second.getByRole('tab', { name: 'Чаты', exact: true }).click();
    const added = await Promise.all(
      ids
        .slice(2)
        .map(id =>
          page.request.post(`${api}/${folderId}/ai-items`, {
            headers,
            data: { item: { type: 'session', id }, included: true }
          })
        )
    );
    expect(added.every(response => response.ok())).toBe(true);
    await expect(second.getByText(titles[2], { exact: true })).toBeVisible();
    await expect(second.getByText(titles[3], { exact: true })).toBeVisible();

    await second
      .getByText(titles[2], { exact: true })
      .click({ button: 'right' });
    await second
      .getByTestId(`AI-MenuPanel-SessionContext-${ids[2]}-AddToFolder`)
      .click();
    await second
      .getByTestId(`AI-MenuPanel-SessionContext-${ids[2]}-Folder-${folderId}`)
      .click();
    await expect(
      second.getByText(titles[2], { exact: true })
    ).not.toBeVisible();
    const current: ChatFolder[] = await (
      await page.request.get(api, { headers })
    ).json();
    expect(current.find(item => item.id === folderId)!.aiItems).toHaveLength(3);
    expect(
      await second.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    const tabs = await second
      .getByRole('tablist', { name: 'Разделы ИИ' })
      .boundingBox();
    const firstRow = await second
      .locator('.ai-menu-panel__row:visible')
      .first()
      .boundingBox();
    expect(tabs).not.toBeNull();
    expect(firstRow).not.toBeNull();
    expect(tabs!.height).toBeLessThan(60);
    expect(firstRow!.y - (tabs!.y + tabs!.height)).toBeGreaterThanOrEqual(-1);
    expect(firstRow!.y - (tabs!.y + tabs!.height)).toBeLessThan(24);
    await second.screenshot({
      path: test.info().outputPath('ai-folder-selected.png')
    });

    await page.request.delete(`${api}/${folderId}`, { headers });
    await expect(
      second.locator(`[data-testid="ChatFolders-Rail-Folder-${folderId}"]`)
    ).toHaveCount(0);
    await expect(second.getByText(titles[2], { exact: true })).toBeVisible();
    await expect(second.getByText(titles[0], { exact: true })).toBeVisible();
    expect(pageErrors).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('ai-folders.png') });
  } finally {
    if (folderId && token)
      await page.request.delete(`${api}/${folderId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
  }
});
