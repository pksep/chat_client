import { expect, test } from '@playwright/test';

test.describe('message XSS protection', () => {
  test('sanitizes active content and preserves safe formatting', async ({
    page
  }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const sanitizerModulePath = '/src/utils/sanitizeMessageHtml.ts';
      const { sanitizeMessageHtml } = await import(sanitizerModulePath);
      const vectors = {
        onerror: '<img src=x onerror="window.__messageXss=1"><p>text</p>',
        svg: '<svg><a onload="window.__messageXss=2"><circle /></a></svg>',
        javascript: '<a href="javascript:window.__messageXss=3">bad</a>',
        css: '<p style="background:url(javascript:window.__messageXss=4)">css</p>',
        mutation:
          '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=window.__messageXss=5>"></mglyph></table></mtext></math>',
        safe: '<p><strong>Важно</strong><br><span class="link" data-span data-user-id="550e8400-e29b-41d4-a716-446655440000">@User</span> <a class="link" href="https://example.com" target="_blank">example</a></p>'
      };
      const sanitized: Record<string, string> = Object.fromEntries(
        Object.entries(vectors).map(([key, value]) => [
          key,
          sanitizeMessageHtml(value)
        ])
      );
      const container = document.createElement('div');
      document.body.append(container);
      (window as typeof window & { __messageXss?: number }).__messageXss = 0;
      container.innerHTML = Object.values(sanitized).join('');

      return {
        sanitized,
        executed: (window as typeof window & { __messageXss?: number })
          .__messageXss
      };
    });

    expect(result.executed).toBe(0);
    expect(Object.values(result.sanitized).join('')).not.toMatch(
      /onerror|onload|javascript:|style=|<svg|<math|<img/i
    );
    expect(result.sanitized.safe).toContain('<strong>Важно</strong>');
    expect(result.sanitized.safe).toContain(
      'data-user-id="550e8400-e29b-41d4-a716-446655440000"'
    );
    expect(result.sanitized.safe).toContain('rel="noopener noreferrer"');
  });

  test('CSP blocks inline scripts', async ({ page }) => {
    await page.goto('/');

    const policy = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");

    await page.evaluate(() => {
      (
        window as typeof window & { __inlineCspProbe?: number }
      ).__inlineCspProbe = 0;
      const script = document.createElement('script');
      script.textContent = 'window.__inlineCspProbe = 1';
      document.body.append(script);
    });

    await page.waitForTimeout(50);
    expect(
      await page.evaluate(
        () =>
          (window as typeof window & { __inlineCspProbe?: number })
            .__inlineCspProbe
      )
    ).toBe(0);
  });
});
