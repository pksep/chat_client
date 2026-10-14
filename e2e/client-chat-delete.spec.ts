import { expect, test, type Page } from '@playwright/test';

const topicId = 'client-delete-fixture';
const oldMessage = {
  id: 'old-client-message',
  topicId,
  senderUserId: 'guest',
  senderUser: { id: 'guest', initials: 'Клиент сайта' },
  text: 'Старая переписка клиента',
  createdAt: '2026-10-13T08:30:00.000Z',
  media: [],
  reactions: [],
  isReadByMe: true,
  isSystem: false
};

async function openConfirmation(page: Page): Promise<void> {
  await page.locator('[data-testid$="Header-PopoverIcon"]:visible').click();
  await page.getByText('Удалить чат', { exact: true }).click();
  await expect(page.getByText('Удаление чата', { exact: true })).toBeVisible();
  await expect(page.getByText(/Переписка сохранится/)).toBeVisible();
}

test.beforeEach(async ({ page }): Promise<void> => {
  await page.route('**/fixture-api/**', route => {
    if (route.request().method() === 'DELETE')
      throw new Error('Тест обязан явно описать удаление');
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith(`/messages/topic/${topicId}`))
      return route.fulfill({ json: [oldMessage] });

    return route.fulfill({ json: [] });
  });
  await page.goto('/e2e/fixtures/client-chat-delete.html');
  await expect(
    page.locator('[data-testid$="Header-PopoverIcon"]:visible')
  ).toBeVisible();
  await expect(page.getByTestId('Fixture-Topics')).toContainText(
    'Клиент сайта'
  );
});

test('отмена сохраняет клиентский чат и не отправляет удаление', async ({
  page
}): Promise<void> => {
  let deletes = 0;
  await page.route(`**/topics/${topicId}`, route => {
    if (route.request().method() === 'DELETE') deletes++;
    return route.fulfill({ status: 204 });
  });
  await openConfirmation(page);
  await page.getByRole('button', { name: 'Нет', exact: true }).click();

  expect(deletes).toBe(0);
  await expect(page).toHaveURL(new RegExp(`/group/${topicId}$`));
  await expect(page.getByTestId('Fixture-Topics')).toContainText(
    'Клиент сайта'
  );
  await expect(
    page.getByText('Старая переписка клиента', { exact: true }).first()
  ).toBeVisible();
});

test('ошибка удаления оставляет чат и позволяет повторить подтверждение', async ({
  page
}): Promise<void> => {
  let deletes = 0;
  await page.route(`**/topics/${topicId}`, route => {
    deletes++;
    return route.fulfill(
      deletes === 1
        ? { status: 403, json: { message: 'Нет доступа' } }
        : { status: 204 }
    );
  });
  await openConfirmation(page);
  await page.getByRole('button', { name: 'Да', exact: true }).click();

  await expect(
    page.getByText('Не удалось удалить чат клиента. Попробуйте ещё раз.', {
      exact: true
    })
  ).toBeVisible();
  await expect(page.getByText('Удаление чата', { exact: true })).toBeVisible();
  await expect(page.getByTestId('Fixture-Topics')).toContainText(
    'Клиент сайта'
  );
  await page.getByRole('button', { name: 'Да', exact: true }).click();
  await expect(page).toHaveURL(/\/group$/);
  expect(deletes).toBe(2);
});

test('после подтверждения чат скрывается, старая переписка сохраняется при возврате', async ({
  page
}, testInfo): Promise<void> => {
  let release: (() => void) | undefined;
  let deletes = 0;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route(`**/topics/${topicId}`, async route => {
    deletes++;
    await pending;
    return route.fulfill({ status: 204 });
  });
  await openConfirmation(page);
  await page.screenshot({
    path: testInfo.outputPath('delete-confirmation.png'),
    animations: 'disabled'
  });
  const confirm = page.getByRole('button', { name: 'Да', exact: true });
  await confirm.click();
  await expect.poll(() => deletes).toBe(1);
  await confirm.click();
  expect(deletes).toBe(1);
  await expect(page.getByTestId('Fixture-Topics')).toContainText(
    'Клиент сайта'
  );
  release!();
  await expect(page).toHaveURL(/\/group$/);
  await expect(page.getByText('Удаление чата', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('Fixture-Topics')).not.toContainText(
    'Клиент сайта'
  );

  await page.evaluate((): void => {
    window.dispatchEvent(new Event('fixture-restore-client'));
  });
  await expect(page.getByTestId('Fixture-Topics')).toContainText(
    'Клиент сайта'
  );
  await expect(
    page.getByText('Старая переписка клиента', { exact: true }).first()
  ).toBeVisible();
});
