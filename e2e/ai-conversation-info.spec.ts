import { expect, test } from '@playwright/test';

const threadId = '13bb30de-aeab-4055-ad84-5db2272168b6';
const attachmentId = 'e32a1a82-b877-4cfa-b70d-842ca8e0b2ce';
const fixture = '/e2e/fixtures/ai-conversation-info.html';
const info = {
  threadId,
  ownerId: 'local-ui-test-user',
  organizationId: 'company',
  title: 'Мои задачи',
  muted: false,
  generation: 0,
  deleted: false
};

test.beforeEach(async ({ page }): Promise<void> => {
  await page.route('**/users/me/access', route =>
    route.fulfill({
      json: { userId: info.ownerId, effective: { ai: true, client: true } }
    })
  );
  await page.route('**/automations', route =>
    route.fulfill({ json: { automations: [] } })
  );
  await page.route('**/action-tasks/**', route =>
    route.fulfill({ json: { tasks: [] } })
  );
});

test('панель сохраняет название и звук, загружает старые файлы после обновления', async ({
  page
}): Promise<void> => {
  let saved = { ...info };
  const after: string[] = [];
  await page.route('**/conversations/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/info')) {
      if (route.request().method() === 'POST')
        saved = { ...saved, ...route.request().postDataJSON() };
      return route.fulfill({ json: saved });
    }
    if (url.pathname.endsWith('/messages')) {
      after.push(url.searchParams.get('after') || '0');
      return route.fulfill({
        json: {
          protocol: 1,
          generation: 0,
          tasks: [],
          incompleteMessages: [],
          nextCursor: url.searchParams.get('after') === '30' ? null : 30,
          messages:
            url.searchParams.get('after') === '30'
              ? [
                  {
                    id: 'old-message',
                    requestId: 'old-request',
                    role: 'user',
                    content: 'Старые файлы',
                    timestamp: 1000,
                    attachments: [
                      {
                        attachmentId,
                        contentHash: 'a'.repeat(64),
                        name: 'Архив.txt',
                        size: 8,
                        contentType: 'text/plain'
                      }
                    ],
                    outputAttachments: [],
                    pendingToolApprovals: []
                  }
                ]
              : []
        }
      });
    }
    return route.fulfill({
      json: { generation: 0, deleted: false, protocol: 1 }
    });
  });
  await page.goto(fixture);
  const header = page.getByRole('button', {
    name: 'Информация об ИИ-чате',
    exact: true
  });
  await expect(header).toBeVisible();
  await header.click();
  const panel = page.getByTestId('AiConversationInfo');
  await expect(panel).toBeVisible();
  await expect(panel.locator('input[type="file"]')).toHaveCount(0);
  await panel.getByRole('textbox').first().fill('Личный план');
  await panel.getByTestId('AiConversationInfo-SaveName').click();
  await expect(header).toContainText('Личный план');
  await panel.getByTestId('AiConversationInfo-Mute').click();
  await expect(panel.getByTestId('AiConversationInfo-Mute')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await panel.getByTestId('AiConversationInfo-Attachments-Tab-files').click();
  await expect(panel).toContainText('Архив.txt');
  expect(after).toContain('30');
  await page.reload();
  await expect(header).toBeVisible();
  await expect(header).toContainText('Личный план');
  await header.click();
  await expect(panel.getByTestId('AiConversationInfo-Mute')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await panel.getByTestId('AiConversationInfo-OpenChat').click();
  await expect(panel).toHaveCount(0);
  expect(page.url()).toContain(`/ai/${threadId}`);
});

test('клик по автору чужой пересылки не открывает историю и действия', async ({
  page
}): Promise<void> => {
  await page.route('**/conversations/**', route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('ownerId') === 'other-user')
      return route.fulfill({ status: 404, json: { message: 'Недоступно' } });
    return route.fulfill({
      json: url.pathname.endsWith('/info')
        ? info
        : {
            generation: 0,
            deleted: false,
            protocol: 1,
            messages: [],
            tasks: [],
            incompleteMessages: [],
            nextCursor: null
          }
    });
  });
  await page.goto(`${fixture}?foreign`);
  await page
    .getByRole('button', { name: 'Переслано: от СЭПи', exact: true })
    .click();
  const panel = page.getByTestId('AiConversationInfo');
  await expect(panel.getByRole('alert')).toContainText('только владельцу');
  for (const name of ['OpenChat', 'Call', 'Name'])
    await expect(panel.getByTestId(`AiConversationInfo-${name}`)).toHaveCount(
      0
    );
  await expect(panel.locator('.profile-attachments')).toHaveCount(0);
});

test('владелец переходит из пересылки в свой исходный ИИ-диалог', async ({
  page
}): Promise<void> => {
  await page.route('**/conversations/**', route =>
    route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith('/info')
        ? info
        : {
            generation: 0,
            deleted: false,
            protocol: 1,
            messages: [],
            tasks: [],
            incompleteMessages: [],
            nextCursor: null
          }
    })
  );
  await page.goto(fixture);
  await page
    .getByRole('button', { name: 'Переслано: от СЭПи', exact: true })
    .click();
  const panel = page.getByTestId('AiConversationInfo');
  await expect(panel.getByTestId('AiConversationInfo-OpenChat')).toBeVisible();
  await panel.getByTestId('AiConversationInfo-OpenChat').click();
  await expect(panel).toHaveCount(0);
  expect(page.url()).toContain(`/ai/${threadId}`);
});
