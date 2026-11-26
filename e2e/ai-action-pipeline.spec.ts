import { expect, test, type Page } from './fixtures/ai-history';
import type { AiActionTask } from '../src/services/aiActionTasks';

test.setTimeout(90_000);
async function prepare(page: Page, sessionId: string): Promise<void> {
  await page.addInitScript(id => {
    const url = 'http://127.0.0.1:65530';
    Object.defineProperty(navigator, 'standalone', {
      configurable: true,
      value: true
    });
    localStorage.setItem(
      'chat_runtime_organizations',
      JSON.stringify([
        {
          url,
          config: {
            CHAT_API_DOMAIN: url,
            CHAT_WS_DOMAIN: 'ws://127.0.0.1:65530',
            CHAT_MASTRA_URL: 'http://127.0.0.1:4111',
            CHAT_ERP_URL: 'http://127.0.0.1:5000'
          }
        }
      ])
    );
    localStorage.setItem('chat_runtime_last_organization', url);
    localStorage.setItem(
      'chat_auth_session',
      JSON.stringify({
        token: 'local-ui-test',
        user: { id: 'local-ui-test-user', name: 'Тест' }
      })
    );
    localStorage.setItem(
      'sep:chat:ai-assistant:v1',
      JSON.stringify({
        sessions: [
          {
            id,
            title: 'Дрон вымышленный',
            description: 'План',
            time: '10:00',
            messages: []
          }
        ],
        tasks: [],
        permissionMode: 'ask'
      })
    );
  }, sessionId);
  await page.route('**/automations', route =>
    route.fulfill({ json: { automations: [] } })
  );
}
const makePlan = (requestId: string): AiActionTask => ({
  id: 'plan-test',
  requestId,
  title: 'Создать деталь и прикрепить файлы',
  revision: 1,
  version: 1,
  digest: 'a'.repeat(64),
  approved: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  completed: 0,
  status: 'waiting_approval',
  steps: [
    {
      key: 'create',
      title: 'Создать деталь',
      status: 'waiting_approval',
      dependencies: [],
      details: {
        toolName: 'erp_actions_erp_entity_editor_create',
        input: {
          type: 'detal',
          entityName: 'Дрон вымышленный',
          entityDesignation: '123-321',
          responsibleName: 'Мамалига'
        }
      }
    },
    ...[
      'image.png',
      'Документ_с_очень_длинным_названием_'.repeat(5) + '.xlsx'
    ].map((name, index) => ({
      key: `file${index + 1}`,
      title: `Прикрепить ${name}`,
      status: 'blocked' as const,
      dependencies: ['create'],
      details: {
        toolName: 'erp_actions_erp_attachment_upload_and_attach',
        input: {
          attachmentNumber: index + 1,
          attachmentName: name,
          entityName: 'Дрон вымышленный',
          entityId: 123,
          entityType: 'detal'
        }
      }
    }))
  ]
});

for (const kind of ['answer', 'completed-plan', 'partial-plan']) {
  test(`текст AI-сообщения можно выделить и скопировать целиком или фрагментом: ${kind}`, async ({
    page
  }, info) => {
    const sessionId = `copy-${kind}-${Date.now()}`;
    await prepare(page, sessionId);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            (window as any).__aiCopiedText = text;
          }
        }
      });
    });
    const answer = 'Ответ для копирования\nВторая строка';
    const plan = makePlan('copy-request');
    plan.approved = true;
    plan.status = kind === 'partial-plan' ? 'partial' : 'completed';
    plan.completed = kind === 'partial-plan' ? 2 : 3;
    plan.steps.forEach(step => {
      step.status = 'completed';
    });
    plan.steps[2].title = 'Прикрепить report.xlsx';
    if (kind === 'partial-plan') {
      plan.steps[1].status = 'failed';
      plan.steps[1].message = 'Не удалось загрузить файл.';
      plan.steps[1].resolution = 'Повторите запрос позже.';
    }
    await page.route('**/action-tasks/**', route => {
      expect(route.request().method()).toBe('GET');
      return route.fulfill({
        json: { tasks: kind === 'answer' ? [] : [plan] }
      });
    });
    await page.route('**/api/agents/generalAgent/stream*', route =>
      route.fulfill({
        contentType: 'text/event-stream',
        body: `data: ${JSON.stringify({ type: 'text-delta', payload: { text: answer } })}\n\ndata: ${JSON.stringify({ type: 'finish' })}\n\n`
      })
    );
    await page.goto(`/ai/${sessionId}`);
    if (kind === 'answer') await send(page, 'Ответь кратко');
    const message = page.locator('.ai-assistant__message--assistant').first();
    const text = message.locator(
      kind === 'answer'
        ? '.message-content__html'
        : '[data-step="create"] .ai-action-pipeline__copy'
    );
    await expect(text).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#startup-shell')).toHaveCount(0, {
      timeout: 30_000
    });
    expect(
      await text.evaluate(element => getComputedStyle(element).userSelect)
    ).toBe('text');
    await text.dblclick({ position: { x: 12, y: 10 } });
    const fragment = kind === 'answer' ? 'Ответ' : 'Создать';
    await expect
      .poll(() => page.evaluate(() => window.getSelection()?.toString().trim()))
      .toBe(fragment);
    // Проверяем штатный copy-обработчик, не меняя буфер обмена пользователя.
    const copied = await text.evaluate(element => {
      const data = new DataTransfer();
      const event = new ClipboardEvent('copy', {
        bubbles: true,
        cancelable: true,
        clipboardData: data
      });
      element.dispatchEvent(event);
      return {
        handled: event.defaultPrevented,
        plain: data.getData('text/plain'),
        html: data.getData('text/html')
      };
    });
    expect(copied.handled).toBe(true);
    expect(copied.plain.trim()).toBe(fragment);
    expect(copied.html).toContain(fragment);
    await text.click({ button: 'right', position: { x: 12, y: 10 } });
    await page
      .getByRole('button', { name: 'Копировать текст', exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => (window as any).__aiCopiedText))
      .toBe(fragment);

    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await text.click({ button: 'right', position: { x: 12, y: 10 } });
    await page
      .getByRole('button', { name: 'Копировать текст', exact: true })
      .click();
    const expected =
      kind === 'answer'
        ? answer
        : (kind === 'partial-plan'
            ? 'Прикрепить image.png: Не удалось загрузить файл. Повторите запрос позже.\n\n'
            : '') +
          '1. Создать деталь\n2. Прикрепить image.png\n3. Прикрепить report.xlsx';
    await expect
      .poll(() => page.evaluate(() => (window as any).__aiCopiedText))
      .toBe(expected);
    await expect(page.locator('.ai-action-pipeline__actions')).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath('copy-message.png'),
      fullPage: true
    });
  });
}

async function send(
  page: Page,
  input = 'Создай деталь Дрон вымышленный 123-321 и прикрепи файлы'
): Promise<void> {
  const stay = page.getByRole('button', { name: 'Остаться в браузере' });
  if (await stay.isVisible().catch(() => false)) await stay.click();
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 30_000
  });
  const editor = page.locator('.ai-assistant__editor:has([contenteditable])');
  await editor.locator('[contenteditable="true"]').click();
  await page.keyboard.insertText(input);
  await editor.locator('.toolbar-button.right:visible').click();
}

for (const theme of ['theme-light', 'theme-dark']) {
  test(`${theme}: обычные кнопки под сообщением, частичный результат и продолжение сообщением`, async ({
    page
  }, info) => {
    if (info.project.name === 'chromium-mobile')
      await page.setViewportSize({ width: 320, height: 844 });
    const sessionId = `plan-${Date.now()}`;
    await prepare(page, sessionId);
    let plan: AiActionTask | null = null;
    let modelCalls = 0,
      approvalCalls = 0;
    let releaseApproval: (() => void) | undefined;
    const approvalGate = new Promise<void>(resolve => {
      releaseApproval = resolve;
    });
    await page.route('**/action-tasks/**', async route => {
      const action = route.request().url().split('/').at(-1);
      if (route.request().method() === 'GET')
        return route.fulfill({ json: { tasks: plan ? [plan] : [] } });
      expect(route.request().postDataJSON()).toEqual({
        revision: 1,
        digest: 'a'.repeat(64)
      });
      if (action === 'approve') {
        approvalCalls += 1;
        plan = {
          ...plan!,
          approved: true,
          version: 2,
          status: 'running',
          completed: 1,
          steps: plan!.steps.map((step, index) => ({
            ...step,
            status:
              index === 0 ? 'completed' : index === 1 ? 'running' : 'pending'
          }))
        };
        await approvalGate;
        plan = {
          ...plan,
          version: 3,
          status: 'partial',
          completed: 2,
          steps: plan.steps.map((step, index) => ({
            ...step,
            status: index === 1 ? 'failed' : 'completed',
            ...(index === 1
              ? {
                  message:
                    'Не удалось перенести этот файл. Остальные действия сохранены.'
                }
              : {})
          }))
        };
      } else throw new Error(`Unexpected action ${action}`);
      return route.fulfill({ json: { task: plan } });
    });
    await page.route('**/api/agents/generalAgent/stream*', route => {
      modelCalls += 1;
      const body = route.request().postDataJSON();
      expect(body.requestContext.requestId).toBeTruthy();
      if (modelCalls === 1) {
        plan = makePlan(body.requestContext.requestId);
      } else {
        expect(JSON.stringify(body)).toContain('Продолжай');
        plan = {
          ...plan!,
          version: 4,
          status: 'completed',
          completed: 3,
          steps: plan!.steps.map(step => ({
            ...step,
            status: 'completed',
            message: undefined
          }))
        };
      }
      return route.fulfill({
        contentType: 'text/event-stream',
        body: [
          { type: 'data-action-task', data: { task: plan } },
          {
            type: 'text-delta',
            payload: { text: 'Неверная модельная фраза: всё создано.' }
          },
          { type: 'finish' }
        ]
          .map(event => `data: ${JSON.stringify(event)}\n\n`)
          .join('')
      });
    });
    await page.goto(`/ai/${sessionId}`);
    await send(page);
    await page.locator('.chat-container').evaluate((element, name) => {
      element.classList.remove('theme-light', 'theme-dark');
      element.classList.add(name);
    }, theme);
    await page.locator('.ai-assistant__scroll').evaluate(element => {
      (element as HTMLElement).style.backgroundImage =
        'repeating-linear-gradient(135deg, #293a55 0 25px, #afc5e6 25px 50px)';
    });
    const card = page.getByTestId('AI-ActionPipeline');
    await expect(card).toHaveCount(1);
    const approval = page
      .locator('.ai-assistant__message')
      .filter({ has: card })
      .locator('.ai-assistant__approval');
    const messageText = page
      .locator('.ai-assistant__message')
      .filter({ has: card })
      .locator('.message-content__html');
    await expect(messageText).toBeEmpty();
    await expect(messageText).toBeHidden();
    await expect(card.locator('details, summary, [title]')).toHaveCount(0);
    const steps = card.locator('.ai-action-pipeline__steps');
    const stepsText = await steps.innerText();
    const stepsHeight = (await steps.boundingBox())!.height;
    await card
      .locator('[data-step="create"] .ai-action-pipeline__copy')
      .click();
    await expect(steps).toHaveText(stepsText, { useInnerText: true });
    expect((await steps.boundingBox())!.height).toBe(stepsHeight);
    await card.getByTestId('AI-ActionPipeline-Status-create').hover();
    await expect(
      page.getByText('Ожидает подтверждения', { exact: true })
    ).toHaveCount(0);
    await expect(card.locator('.badges-text')).toHaveText(['1', '2', '3']);
    const placement = await card.evaluate(element => {
      const parent = element.parentElement!;
      const text = parent.querySelector('.message-content__html')!;
      return {
        inConversation: Boolean(element.closest('.ai-assistant__conversation')),
        insideMessage: Boolean(element.closest('.ai-assistant__message')),
        insideAnswer: parent.matches('.ai-assistant__answer'),
        afterMessageText:
          element.getBoundingClientRect().top >=
          text.getBoundingClientRect().bottom,
        answerBackground: getComputedStyle(parent).backgroundColor,
        wallpaper: getComputedStyle(element.closest('.ai-assistant__scroll')!)
          .backgroundImage,
        textColor: getComputedStyle(text).color,
        stepColor: getComputedStyle(element).color,
        leftOffset:
          element.getBoundingClientRect().left -
          parent.getBoundingClientRect().left -
          parseFloat(getComputedStyle(parent).paddingLeft),
        borderWidth: getComputedStyle(element).borderTopWidth,
        background: getComputedStyle(element).backgroundColor,
        connectorWidth: getComputedStyle(
          element.querySelector('li')!,
          '::before'
        ).width,
        lastConnector: getComputedStyle(
          element.querySelector('li:last-child')!,
          '::before'
        ).content
      };
    });
    expect(placement).toMatchObject({
      inConversation: true,
      insideMessage: true,
      insideAnswer: true,
      answerBackground: 'rgba(0, 0, 0, 0)',
      afterMessageText: true,
      borderWidth: '0px',
      background: 'rgba(0, 0, 0, 0)',
      connectorWidth: '1px',
      lastConnector: 'none'
    });
    expect(placement.wallpaper).toContain('repeating-linear-gradient');
    expect(placement.stepColor).toBe(placement.textColor);
    expect(Math.abs(placement.leftOffset)).toBeLessThanOrEqual(1);
    await expect(
      page.getByText('Неверная модельная фраза', { exact: false })
    ).toHaveCount(0);
    await expect(page.locator('.ai-assistant__thinking')).toBeHidden();
    await expect(card.locator('button, [role="button"]')).toHaveCount(0);
    await expect(page.locator('.ai-action-pipeline__actions')).toHaveCount(0);
    await expect(approval.getByRole('button')).toHaveText([
      'Отклонить',
      'Подтвердить'
    ]);
    await expect(approval).toBeVisible();
    expect(
      await approval.evaluate(element =>
        Boolean(element.closest('.message__bubble'))
      )
    ).toBe(false);
    expect(approvalCalls).toBe(0);
    await expect(page.locator('#startup-shell')).toHaveCount(0, {
      timeout: 30_000
    });
    const bounds = await card.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
      page.viewportSize()!.width + 1
    );
    await expect
      .poll(() =>
        card.evaluate(element => element.scrollWidth - element.clientWidth)
      )
      .toBeLessThanOrEqual(1);
    await page.screenshot({
      path: info.outputPath('pipeline-waiting.png'),
      fullPage: true
    });
    await approval.getByRole('button', { name: 'Подтвердить' }).click();
    await expect(card.locator('[data-step="file1"]')).toHaveAttribute(
      'data-status',
      'running'
    );
    await expect(card.locator('[data-step="create"]')).toHaveAttribute(
      'data-status',
      'completed'
    );
    await expect(
      card.locator('[data-step="create"] .ai-action-pipeline__number')
    ).toHaveClass(/green-yui-kit/);
    await expect(card.locator('[data-step="file1"] .badges-text')).toHaveText(
      '2'
    );
    await expect(card.locator('.ai-action-pipeline__progress')).toHaveCount(1);
    await expect(messageText).toBeEmpty();
    expect(
      await card
        .locator('.ai-action-pipeline__progress')
        .evaluate(element => getComputedStyle(element).animationName)
    ).toBe('menu-bottom-nav-ai-status-spin');
    expect(
      await card
        .locator('[data-step="file1"] .badges-text')
        .evaluate(element => getComputedStyle(element).animationName)
    ).toBe('none');
    await page.screenshot({
      path: info.outputPath('pipeline-running.png'),
      fullPage: true
    });
    await expect(card.locator('button, [role="button"]')).toHaveCount(0);
    await expect(approval).toHaveCount(0);
    expect(approvalCalls).toBe(1);
    releaseApproval!();
    await expect(card.locator('[data-step="file1"]')).toHaveAttribute(
      'data-status',
      'failed'
    );
    await expect(card.locator('button, [role="button"]')).toHaveCount(0);
    await page.reload();
    await expect(card).toHaveCount(1);
    await page.locator('.chat-container').evaluate((element, name) => {
      element.classList.remove('theme-light', 'theme-dark');
      element.classList.add(name);
    }, theme);
    await page.locator('.ai-assistant__scroll').evaluate(element => {
      (element as HTMLElement).style.backgroundImage =
        'repeating-linear-gradient(135deg, #293a55 0 25px, #afc5e6 25px 50px)';
    });
    await expect(card.locator('[data-step="file1"]')).toHaveAttribute(
      'data-status',
      'failed'
    );
    await expect(
      card.locator('[data-step="file1"] .ai-action-pipeline__number')
    ).toHaveClass(/red-yui-kit/);
    await expect(card.locator('[data-step="file1"] .badges-text')).toHaveText(
      '2'
    );
    await expect(card.locator('.ai-action-pipeline__progress')).toHaveCount(0);
    await expect(card.locator('button, [role="button"]')).toHaveCount(0);
    await expect(approval).toHaveCount(0);
    await send(page, 'Продолжай');
    await expect(card.locator('[data-status="completed"]')).toHaveCount(3);
    await expect(messageText).toBeEmpty();
    await page.reload();
    await expect(card.locator('[data-status="completed"]')).toHaveCount(3);
    await expect(messageText).toBeEmpty();
    await page.locator('.chat-container').evaluate((element, name) => {
      element.classList.remove('theme-light', 'theme-dark');
      element.classList.add(name);
    }, theme);
    await page.locator('.ai-assistant__scroll').evaluate(element => {
      (element as HTMLElement).style.backgroundImage =
        'repeating-linear-gradient(135deg, #293a55 0 25px, #afc5e6 25px 50px)';
    });
    await expect(card.locator('.ai-action-pipeline__steps')).not.toContainText(
      'Выполнено и проверено'
    );
    await expect(card.locator('.badges-text')).toHaveText(['1', '2', '3']);
    await expect(card.locator('button, [role="button"]')).toHaveCount(0);
    await expect(page.locator('.ai-action-pipeline__actions')).toHaveCount(0);
    await expect(approval).toHaveCount(0);
    expect(modelCalls).toBe(2);
    expect(approvalCalls).toBe(1);
    const colors = await card.evaluate(element => ({
      color: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor
    }));
    expect(colors.color).not.toBe(colors.background);
    await page.screenshot({
      path: info.outputPath('pipeline-completed.png'),
      fullPage: true
    });
  });
}

test('автоматически восстанавливает неизвестный результат без дополнительных кнопок', async ({
  page
}) => {
  const sessionId = `plan-review-${Date.now()}`;
  await prepare(page, sessionId);
  const plan = makePlan('old-request');
  plan.status = 'needs_review';
  plan.approved = true;
  plan.steps[0].status = 'uncertain';
  let verified = false;
  const actions: string[] = [];
  await page.route('**/action-tasks/**', route => {
    if (route.request().method() === 'GET') {
      if (verified) {
        plan.steps[0].status = 'completed';
        plan.steps[1].status = 'pending';
        plan.steps[2].status = 'pending';
        plan.status = 'pending';
        plan.completed = 1;
        plan.version = 2;
      }
      return route.fulfill({ json: { tasks: [plan] } });
    }
    actions.push(route.request().url().split('/').at(-1)!);
    return route.fulfill({
      status: 409,
      json: {
        code: 'AI_PLAN_CONFLICT',
        userMessage: 'План изменился. Обновите его и проверьте новую версию.'
      }
    });
  });
  await page.goto(`/ai/${sessionId}`);
  const card = page.getByTestId('AI-ActionPipeline');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(
    card.locator('[data-step="create"] .ai-action-pipeline__number')
  ).toHaveClass(/orange-yui-kit/);
  await expect(card.locator('[data-step="create"] .badges-text')).toHaveText(
    '1'
  );
  await expect(
    card.getByRole('button', { name: 'Продолжить оставшиеся' })
  ).toHaveCount(0);
  await expect(
    card.getByRole('button', { name: 'Проверить результат' })
  ).toHaveCount(0);
  await expect(card).not.toContainText('Проверка продолжится автоматически');
  await expect(
    page.locator('.ai-assistant__message .message-content__html')
  ).toBeEmpty();
  verified = true;
  await expect(card.locator('[data-step="create"]')).toHaveAttribute(
    'data-status',
    'completed'
  );
  expect(actions).toEqual([]);
  await expect(card.locator('button, [role="button"]')).toHaveCount(0);
  await expect(page.locator('.ai-assistant__approval')).toHaveCount(0);
  await expect(page.locator('.ai-action-pipeline__actions')).toHaveCount(0);
  await expect(page.locator('.ai-action-pipeline__notice')).toHaveCount(0);
  expect(actions).toEqual([]);
  await expect(card.locator('[data-step="create"]')).toHaveAttribute(
    'data-status',
    'completed'
  );
});

for (const scenario of [
  { label: 'Отклонить', action: 'cancel', conflict: false },
  { label: 'Подтвердить', action: 'approve', conflict: true },
  { label: 'Отклонить', action: 'cancel', conflict: true }
]) {
  test(`обычная кнопка «${scenario.label}» управляет точным планом после перезагрузки, конфликт: ${scenario.conflict}`, async ({
    page
  }) => {
    const sessionId = `plan-standard-actions-${Date.now()}`;
    await prepare(page, sessionId);
    const plan = makePlan('standard-actions');
    const actions: string[] = [];
    await page.route('**/api/agents/generalAgent/stream*', () => {
      throw new Error('Решение по сохранённому плану не вызывает модель.');
    });
    await page.route('**/action-tasks/**', route => {
      if (route.request().method() === 'GET')
        return route.fulfill({ json: { tasks: [plan] } });
      actions.push(route.request().url().split('/').at(-1)!);
      expect(route.request().postDataJSON()).toEqual({
        revision: plan.revision,
        digest: plan.digest
      });
      if (scenario.conflict)
        return route.fulfill({
          status: 409,
          json: {
            code: 'AI_PLAN_CONFLICT',
            userMessage:
              'План изменился. Обновите его и проверьте новую версию.'
          }
        });
      plan.version += 1;
      plan.status = 'completed';
      plan.steps.forEach(step => {
        step.status = 'cancelled';
      });
      return route.fulfill({ json: { task: plan } });
    });
    await page.goto(`/ai/${sessionId}`);
    const card = page.getByTestId('AI-ActionPipeline');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await page.reload();
    const approval = page
      .locator('.ai-assistant__message')
      .filter({ has: card })
      .locator('.ai-assistant__approval');
    await expect(approval.getByRole('button')).toHaveText([
      'Отклонить',
      'Подтвердить'
    ]);
    await expect(card.locator('button, [role="button"]')).toHaveCount(0);
    await approval.getByRole('button', { name: scenario.label }).click();
    await expect.poll(() => actions).toEqual([scenario.action]);
    if (scenario.conflict) {
      await expect(
        page.getByText('План изменился. Обновите его и проверьте новую версию.')
      ).toBeVisible();
      await expect(card).not.toContainText('План изменился');
      await expect(approval.getByRole('button')).toHaveCount(2);
      await expect(
        approval.getByRole('button', { name: 'Подтвердить' })
      ).toBeEnabled();
    } else {
      await expect(approval).toHaveCount(0);
      await expect(card.locator('[data-status="cancelled"]')).toHaveCount(3);
      await page.reload();
      await expect(card.locator('[data-status="cancelled"]')).toHaveCount(3);
      await expect(approval).toHaveCount(0);
    }
    await expect(page.locator('.ai-action-pipeline__actions')).toHaveCount(0);
    await expect(page.locator('.ai-action-pipeline__notice')).toHaveCount(0);
    await expect(card.locator('button, [role="button"]')).toHaveCount(0);
  });
}

test('при совпадении карточки объясняет решение и не предлагает повторное создание', async ({
  page
}, info) => {
  const sessionId = `plan-duplicate-${Date.now()}`;
  await prepare(page, sessionId);
  const plan = makePlan('duplicate-request');
  plan.approved = true;
  plan.status = 'failed';
  Object.assign(plan.steps[0], {
    status: 'failed',
    retryable: false,
    message:
      'Карточка «Дрон вымышленный» с обозначением «123-321» уже существует. Новая карточка не создана.',
    resolution:
      'Можно использовать существующую карточку либо указать другое обозначение.'
  });
  await page.route('**/action-tasks/**', route =>
    route.fulfill({ json: { tasks: [plan] } })
  );
  await page.goto(`/ai/${sessionId}`);
  const timeline = page.getByTestId('AI-ActionPipeline');
  await expect(timeline).toBeVisible({ timeout: 30_000 });
  await expect(
    page.locator('.ai-assistant__message .message-content__html')
  ).toContainText('Можно использовать существующую карточку');
  await expect(timeline).not.toContainText(
    'Можно использовать существующую карточку'
  );
  await timeline
    .locator('[data-step="create"] .ai-action-pipeline__copy')
    .click();
  await expect(timeline.locator('details, summary')).toHaveCount(0);
  await expect(
    timeline.locator('.ai-action-pipeline__steps')
  ).not.toContainText('Не выполнено');
  await expect(
    timeline.getByRole('button', { name: 'Продолжить оставшиеся' })
  ).toHaveCount(0);
  await expect(
    timeline.getByRole('button', { name: 'Проверить результат' })
  ).toHaveCount(0);
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 30_000
  });
  await page.screenshot({
    path: info.outputPath('duplicate-resolution.png'),
    fullPage: true
  });
});

test('ошибки новых запросов не дописываются в прежний план, в том числе после повтора и перезагрузки', async ({
  page
}) => {
  const sessionId = `plan-error-isolation-${Date.now()}`;
  await prepare(page, sessionId);
  const plan = makePlan('finished-request');
  plan.status = 'completed';
  plan.approved = true;
  plan.completed = plan.steps.length;
  plan.steps.forEach(step => {
    step.status = 'completed';
  });
  await page.route('**/action-tasks/**', route =>
    route.fulfill({ json: { tasks: [plan] } })
  );
  const failure =
    'Не удалось сохранить доступ к вложениям для продолжения поручения. Попробуйте позже. Ранее выполненные шаги сохраняются.';
  await page.route('**/api/agents/generalAgent/stream*', route =>
    route.fulfill({
      status: 503,
      json: { code: 'AI_ATTACHMENT_RETAIN_FAILED', userMessage: failure }
    })
  );
  await page.goto(`/ai/${sessionId}`);
  const card = page.getByTestId('AI-ActionPipeline');
  await expect(card).toBeVisible({ timeout: 30_000 });
  const oldMessage = page
    .locator('.ai-assistant__message')
    .filter({ has: card });
  const originalText = await oldMessage.innerText();
  for (let attempt = 1; attempt <= 2; attempt++) {
    await send(page);
    await expect(
      page
        .locator('.ai-assistant__message .message-content__html')
        .filter({ hasText: failure })
    ).toHaveCount(attempt);
    await expect(oldMessage).toHaveText(originalText, { useInnerText: true });
    await expect(page.locator('.ai-action-pipeline__notice')).toHaveCount(0);
  }
  await page.reload();
  await expect(card).toBeVisible();
  await expect(oldMessage).toHaveText(originalText, { useInnerText: true });
  await expect(
    page
      .locator('.ai-assistant__message .message-content__html')
      .filter({ hasText: failure })
  ).toHaveCount(2);
  await expect(page.locator('.ai-action-pipeline__notice')).toHaveCount(0);
});

test('шаги остаются в своём сообщении и не перемещаются к новым ответам', async ({
  page
}) => {
  const sessionId = `plan-position-${Date.now()}`;
  await prepare(page, sessionId);
  const finished = (id: string): AiActionTask => ({
    ...makePlan(id),
    id,
    approved: true,
    status: 'completed',
    completed: 3,
    steps: makePlan(id).steps.map(step => ({ ...step, status: 'completed' }))
  });
  const pending = { ...makePlan('pending'), id: 'pending' };
  await page.route('**/action-tasks/**', route => {
    expect(route.request().method()).toBe('GET');
    return route.fulfill({
      json: { tasks: [finished('old'), pending, finished('latest')] }
    });
  });
  await page.route('**/api/agents/generalAgent/stream*', route =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ type: 'text-delta', payload: { text: 'Это последний ответ в чате.' } })}\n\ndata: ${JSON.stringify({ type: 'finish' })}\n\n`
    })
  );
  await page.goto(`/ai/${sessionId}`);
  await expect(page.getByTestId('AI-ActionPipeline')).toHaveCount(3, {
    timeout: 30_000
  });
  await send(page);
  await expect(
    page.getByTestId(/^AI-Assistant-Message-.*-MessageText$/).filter({
      hasText: 'Это последний ответ в чате.'
    })
  ).toBeVisible();
  await expect(page.getByTestId('AI-ActionPipeline')).toHaveCount(3);
  await expect(page.locator('.ai-assistant__approval-confirm')).toHaveCount(1);
  await expect(page.locator('.ai-action-pipeline__actions')).toHaveCount(0);
  await expect(
    page.getByTestId('AI-ActionPipeline').locator('button, [role="button"]')
  ).toHaveCount(0);
  expect(
    await page
      .getByTestId('AI-ActionPipeline')
      .first()
      .evaluate(element => {
        const messages = element
          .closest('.ai-assistant__conversation')!
          .querySelectorAll(':scope > .ai-assistant__message');
        return (
          Boolean(element.closest('.ai-assistant__answer')) &&
          element.closest('.ai-assistant__message') !==
            messages[messages.length - 1]
        );
      })
  ).toBe(true);
});
