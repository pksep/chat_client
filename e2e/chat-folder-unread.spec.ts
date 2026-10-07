import { expect, test } from '@playwright/test';

for (const scope of ['chats', 'clients']) {
  for (const theme of ['light', 'dark']) {
    test(`Счётчики папок учитывают заглушённые чаты и упоминания: ${scope}, ${theme}`, async ({
      page,
      isMobile
    }) => {
      await page.goto(
        `/e2e/fixtures/chat-folder-loading.html?unread${scope === 'clients' ? '&clients' : ''}`
      );
      if (theme === 'dark') await page.getByTestId('Fixture-Theme').click();
      const all = page.getByTestId('ChatFolders-Rail-All-UnreadCount');
      const folder = page
        .getByTestId('ChatFolders-Rail-Folder-folder-0')
        .locator('.chat-folder-rail__badge');
      const mutedFolder = page
        .getByTestId('ChatFolders-Rail-Folder-folder-1')
        .locator('.chat-folder-rail__badge');
      const gray = await all.evaluate(el =>
        getComputedStyle(el).getPropertyValue('--text-light-color').trim()
      );
      const blue = await all.evaluate(
        el => getComputedStyle(el).backgroundColor
      );
      const rgb = (hex: string) =>
        `rgb(${[1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16)).join(', ')})`;
      await page.getByTestId('Fixture-MuteAll').click();
      await expect(all).toHaveText('9');
      await expect(all).toHaveCSS('background-color', rgb(gray));
      if (!isMobile) {
        await expect(folder).toHaveCSS('background-color', rgb(gray));
        await expect(mutedFolder).toHaveCSS('background-color', rgb(gray));
      }
      await page.getByTestId('Fixture-UnmuteRead').click();
      await expect(all).toHaveCSS('background-color', rgb(gray));
      await page.getByTestId('Fixture-UnmuteFirst').click();
      await expect(all).toHaveCSS('background-color', blue);
      if (!isMobile) {
        await expect(folder).toHaveCSS('background-color', blue);
        await expect(mutedFolder).toHaveCSS('background-color', rgb(gray));
      }
      await page.getByTestId('Fixture-MuteAll').click();
      await expect(all).toHaveCSS('background-color', rgb(gray));
      await page.getByTestId('Fixture-MentionFirst').click();
      await expect(all).toHaveCSS('background-color', blue);
      if (!isMobile) {
        await expect(folder).toHaveCSS('background-color', blue);
        await expect(mutedFolder).toHaveCSS('background-color', rgb(gray));
      }
      await page.getByTestId('Fixture-ReadFirst').click();
      await expect(all).toHaveText('6');
      await expect(all).toHaveCSS('background-color', rgb(gray));
    });

    test(`«Все чаты» считает непрочитанные в разделе, обновляется без сдвигов: ${scope}, ${theme}`, async ({
      page,
      isMobile
    }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(
        `/e2e/fixtures/chat-folder-loading.html?unread${scope === 'clients' ? '&clients' : ''}`
      );
      if (theme === 'dark') await page.getByTestId('Fixture-Theme').click();
      const all = page.getByTestId('ChatFolders-Rail-All');
      const badge = page.getByTestId('ChatFolders-Rail-All-UnreadCount');
      const folder = page.getByTestId('ChatFolders-Rail-Folder-folder-0');
      const selectFolder = () => (isMobile ? folder.tap() : folder.click());
      await expect(all).toHaveAttribute('aria-pressed', 'true');
      // Пересекающиеся папки не дублируют счётчик; чаты вне папок тоже учитываются.
      await expect(badge).toHaveText('9');
      await expect(badge).toHaveAttribute(
        'aria-label',
        'Непрочитанных сообщений: 9'
      );
      await expect(badge).toHaveCSS('width', '18px');
      await expect(badge).toHaveCSS('height', '18px');
      await expect(badge).toHaveCSS('font-size', '12px');
      await expect(badge).toHaveCSS('line-height', '15px');
      const colors = await badge.evaluate(element => {
        const probe = document.createElement('span');
        element.appendChild(probe);
        probe.style.color = 'var(--text-link)';
        const background = getComputedStyle(probe).color;
        probe.style.color = 'var(--white, #fff)';
        const color = getComputedStyle(probe).color;
        probe.remove();
        return { background, color };
      });
      await expect(badge).toHaveCSS('background-color', colors.background);
      await expect(badge).toHaveCSS('color', colors.color);
      const box = await all.boundingBox();
      const avatar = await all
        .locator('.chat-folder-rail__avatar')
        .boundingBox();
      const badgeBox = await badge.boundingBox();
      expect(badgeBox?.y).toBe(avatar!.y - 5);
      expect(badgeBox!.x + badgeBox!.width).toBe(avatar!.x + avatar!.width + 5);
      expect(
        await badge.evaluate(element => {
          const rect = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(rect.left + rect.width / 2, rect.top + 2)
          );
        })
      ).toBe(true);
      if (!isMobile)
        await expect(folder.locator('.chat-folder-rail__badge')).toHaveText(
          '7'
        );

      await page.getByTestId('Fixture-Incoming').click();
      await expect(badge).toHaveText('10');
      await expect(badge).toHaveClass(/chat-folder-rail__badge--wide/);
      expect(await all.boundingBox()).toEqual(box);
      await selectFolder();
      await expect(folder).toHaveAttribute('aria-pressed', 'true');
      await expect(badge).toHaveText('10');
      await expect(all).toHaveAttribute('aria-pressed', 'false');
      await selectFolder();
      await expect(folder).toHaveAttribute('aria-pressed', 'false');
      await expect(all).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-folder-id]')).toHaveCount(6);
      await expect(badge).toHaveText('10');
      await selectFolder();
      await expect(folder).toHaveAttribute('aria-pressed', 'true');
      await folder.press('Enter');
      await expect(all).toHaveAttribute('aria-pressed', 'true');
      await selectFolder();
      await page.getByTestId('ChatFolders-Rail-Folder-folder-1').click();
      await expect(folder).toHaveAttribute('aria-pressed', 'false');
      await expect(
        page.getByTestId('ChatFolders-Rail-Folder-folder-1')
      ).toHaveAttribute('aria-pressed', 'true');
      await selectFolder();
      await expect(folder).toHaveAttribute('aria-pressed', 'true');
      await page.getByTestId('ChatFolders-Rail-Manage').click();
      await expect(folder).toHaveAttribute('aria-pressed', 'false');
      await selectFolder();
      await expect(folder).toHaveAttribute('aria-pressed', 'true');
      await all.click();
      await expect(all).toHaveAttribute('aria-pressed', 'true');
      await all.hover();
      await expect(badge).toHaveCSS('background-color', colors.background);
      const selectedBox = await all.boundingBox();

      await page.getByTestId('Fixture-ManyUnread').click();
      await expect(badge).toHaveText('99+');
      await expect(badge).toHaveAttribute(
        'aria-label',
        'Непрочитанных сообщений: 106'
      );
      expect(await all.boundingBox()).toEqual(selectedBox);
      await page.screenshot({
        path: testInfo.outputPath('all-chats-unread.png')
      });
      await page.getByTestId('Fixture-ReadFirst').click();
      await expect(badge).toHaveText('6');
      await expect(badge).not.toHaveClass(/chat-folder-rail__badge--wide/);
      await page.getByTestId('Fixture-NoFolders').click();
      await expect(page.locator('[data-folder-id]')).toHaveCount(0);
      await expect(badge).toHaveText('6');
      await page.getByTestId('Fixture-Auth').click();
      await expect(badge).toHaveCount(0);
      await page.getByTestId('Fixture-Auth').click();
      await expect(badge).toHaveText('6');
      await page.getByTestId('Fixture-ReadAll').click();
      await expect(badge).toHaveCount(0);
      expect(await all.boundingBox()).toEqual(box);
      expect(errors).toEqual([]);
    });
  }
}
