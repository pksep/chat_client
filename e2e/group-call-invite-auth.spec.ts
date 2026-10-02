import { expect, test } from '@playwright/test';
import { createAndroidPerformanceServer } from './fixtures/android-performance-server';

const countInvitePreviewRequests = (
  fixture: Awaited<ReturnType<typeof createAndroidPerformanceServer>>
) =>
  fixture.requests.filter(request =>
    request.path.startsWith('/api/calls/invite-preview?')
  ).length;

test('обрабатывает приглашение на звонок сразу после авторизации', async ({
  page
}, testInfo) => {
  test.setTimeout(60_000);
  const fixture = await createAndroidPerformanceServer({
    port: 5330 + testInfo.parallelIndex,
    topicCount: 1,
    messagesPerTopic: 2,
    userCount: 2
  });
  try {
    await page.route(
      `${fixture.origin}/api/auth/credentials-login`,
      async route => {
        await route.fulfill({
          json: {
            token: 'call-invite-auth-token',
            user: fixture.user
          }
        });
      }
    );

    await page.goto(
      '/?callRoom=post-auth-room&callInvite=post-auth-signed-invite'
    );
    await page.getByPlaceholder('Введите ссылку').fill(fixture.origin);
    await page.getByPlaceholder('Введите ссылку').press('Enter');

    await page.getByPlaceholder('Введите логин').fill('invite-user');
    await page.getByPlaceholder('Введите пароль').fill('invite-password');
    await page.getByPlaceholder('Введите пароль').press('Enter');

    await expect(page.getByTestId('AuthorizationScreen')).toBeHidden();
    await expect
      .poll(() => countInvitePreviewRequests(fixture), { timeout: 30_000 })
      .toBe(1);
  } finally {
    await fixture.close();
  }
});

test('обрабатывает приглашение сразу для авторизованного пользователя', async ({
  page
}, testInfo) => {
  test.setTimeout(60_000);
  const fixture = await createAndroidPerformanceServer({
    port: 5340 + testInfo.parallelIndex,
    topicCount: 1,
    messagesPerTopic: 2,
    userCount: 2
  });

  try {
    await page.addInitScript(
      ({ organization, config, user }) => {
        localStorage.setItem(
          'chat_runtime_organizations',
          JSON.stringify([{ url: organization, config }])
        );
        localStorage.setItem('chat_runtime_last_organization', organization);
        localStorage.setItem(
          'chat_auth_session',
          JSON.stringify({ token: 'authorized-call-invite-token', user })
        );
      },
      {
        organization: fixture.origin,
        config: fixture.config,
        user: fixture.user
      }
    );

    await page.goto(
      '/?callRoom=authorized-room&callInvite=authorized-signed-invite'
    );

    await expect(page.getByTestId('AuthorizationScreen')).toBeHidden();
    await expect
      .poll(() => countInvitePreviewRequests(fixture), { timeout: 30_000 })
      .toBe(1);
  } finally {
    await fixture.close();
  }
});

test('запрашивает invite LiveKit-токен после ANSWER_CALL', async ({
  page
}, testInfo) => {
  test.setTimeout(60_000);
  const fixture = await createAndroidPerformanceServer({
    port: 5360 + testInfo.parallelIndex,
    topicCount: 1,
    messagesPerTopic: 2,
    userCount: 2
  });
  fixture.state.callInviteActive = true;

  const roomId = 'invite-token-room';
  const inviteToken = 'invite-token-that-must-be-preserved';
  const inviteTokenRequest = () =>
    fixture.requests.filter(request =>
      request.path.startsWith('/api/calls/invite-livekit-token?')
    );
  const regularTokenRequest = () =>
    fixture.requests.filter(request =>
      request.path.startsWith('/api/calls/livekit-token?')
    );

  try {
    await page.addInitScript(
      ({ organization, config, user }) => {
        localStorage.setItem(
          'chat_runtime_organizations',
          JSON.stringify([{ url: organization, config }])
        );
        localStorage.setItem('chat_runtime_last_organization', organization);
        localStorage.setItem(
          'chat_auth_session',
          JSON.stringify({ token: 'authorized-call-invite-token', user })
        );
      },
      {
        organization: fixture.origin,
        config: fixture.config,
        user: fixture.user
      }
    );

    await page.goto(`/?callRoom=${roomId}&callInvite=${inviteToken}`);

    await expect(page.getByTestId('AuthorizationScreen')).toBeHidden();
    await expect
      .poll(() => inviteTokenRequest().length, { timeout: 30_000 })
      .toBeGreaterThan(0);

    expect(regularTokenRequest()).toHaveLength(0);
    expect(inviteTokenRequest()[0]?.path).toContain(
      `roomId=${roomId}&invite=${inviteToken}`
    );
    expect(
      fixture.connections.find(event => event.event === 'answerCall')
    ).toMatchObject({
      payload: {
        userId: fixture.user.id,
        roomId,
        inviteToken
      }
    });
  } finally {
    await fixture.close();
  }
});

test('не открывает авторизацию при клике по production-ссылке внутри локального чата', async ({
  page,
  context
}, testInfo) => {
  test.setTimeout(60_000);
  const fixture = await createAndroidPerformanceServer({
    port: 5350 + testInfo.parallelIndex,
    topicCount: 1,
    messagesPerTopic: 2,
    userCount: 2
  });
  const isMobile = testInfo.project.name.includes('mobile');
  const message = fixture.histories.get(fixture.topics[0].id)?.at(-1);

  if (!message) {
    throw new Error('Test chat message is unavailable');
  }

  message.text =
    '<a href="https://chat.pksep.ru/?callRoom=in-chat-room&amp;callInvite=in-chat-signed-invite" target="_blank">Войти в звонок</a>';

  try {
    await page.addInitScript(
      ({ organization, config, user }) => {
        localStorage.setItem(
          'chat_runtime_organizations',
          JSON.stringify([{ url: organization, config }])
        );
        localStorage.setItem('chat_runtime_last_organization', organization);
        localStorage.setItem(
          'chat_auth_session',
          JSON.stringify({ token: 'authorized-in-chat-invite-token', user })
        );
      },
      {
        organization: fixture.origin,
        config: fixture.config,
        user: fixture.user
      }
    );

    await page.goto('/');
    if (isMobile) {
      await page.getByRole('button', { name: 'Остаться в браузере' }).click();
    }
    await page
      .locator('[data-testid*="-ContactList-Item"]:visible')
      .first()
      .click();
    const inviteLink = page.getByRole('link', { name: 'Войти в звонок' });
    await expect(inviteLink).toBeVisible({ timeout: 30_000 });
    await inviteLink.click();

    await expect(page.getByTestId('AuthorizationScreen')).toBeHidden();
    await expect
      .poll(() => countInvitePreviewRequests(fixture), { timeout: 30_000 })
      .toBe(1);
    expect(new URL(page.url()).origin).toBe('http://localhost:5173');
    expect(context.pages()).toHaveLength(1);
  } finally {
    await fixture.close();
  }
});
