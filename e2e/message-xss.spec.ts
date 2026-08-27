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
        encodedTab: '<a href="java&#x09;script:window.__messageXss=6">bad</a>',
        encodedEntity:
          '<a href="jav&#x61;script:window.__messageXss=7">bad</a>',
        dataUrl:
          '<a href="data:text/html,<script>window.__messageXss=8</script>">bad</a>',
        formAction:
          '<form><button formaction="javascript:window.__messageXss=9">bad</button></form>',
        iframe:
          '<iframe srcdoc="<script>window.__messageXss=10</script>"></iframe>',
        object: '<object data="javascript:window.__messageXss=11"></object>',
        clobber:
          '<p id="attributes" name="attributes" style="background:url(javascript:window.__messageXss=12)">text</p>',
        invalidMention:
          '<span data-user-id="invalid" onclick="window.__messageXss=13">@bad</span>',
        safe: '<p>🙂🚀 <strong>Важно</strong><b>bold</b><em>em</em><i>italic</i><u>underline</u><s>s</s><strike>strike</strike><br><span class="link message-content__text-mention" data-span data-user-id="550e8400-e29b-41d4-a716-446655440000" contenteditable="false">@User</span> <a class="link" href="https://example.com" target="_blank">example</a><a href="mailto:user@example.com">mail</a><a href="tel:+123">phone</a><a href="/relative">relative</a><ul><li>one</li></ul><ol start="3"><li>three</li></ol><code>code</code><hr></p>'
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
      /onerror|onload|onclick|javascript:|data:text\/html|style=|srcdoc|formaction|<script|<svg|<math|<img|<form|<button|<iframe|<object|\sid=|\sname=/i
    );
    expect(result.sanitized.safe).toContain('🙂🚀');
    expect(result.sanitized.safe).toContain('<strong>Важно</strong>');
    for (const tag of [
      'p',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'strike',
      'br',
      'span',
      'a',
      'ul',
      'li',
      'ol',
      'code',
      'hr'
    ]) {
      expect(result.sanitized.safe).toContain(`<${tag}`);
    }
    expect(result.sanitized.safe).toContain(
      'data-user-id="550e8400-e29b-41d4-a716-446655440000"'
    );
    expect(result.sanitized.safe).toContain('rel="noopener noreferrer"');
    expect(result.sanitized.safe).toContain('href="mailto:user@example.com"');
    expect(result.sanitized.safe).toContain('href="tel:+123"');
    expect(result.sanitized.safe).toContain('href="/relative"');
    expect(result.sanitized.safe).not.toContain('contenteditable');
    expect(result.sanitized.invalidMention).not.toContain('data-user-id');
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
