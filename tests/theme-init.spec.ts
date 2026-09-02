import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';

const themeScript = readFileSync(
  new URL('../public/theme-init.js', import.meta.url),
  'utf8'
);

const runThemeScript = (savedTheme: string | null) => {
  const classes = new Set<string>();
  const rootStyle: Record<string, string> = {};
  let themeColor = '';

  runInNewContext(themeScript, {
    window: {
      localStorage: {
        getItem: () => savedTheme
      }
    },
    document: {
      documentElement: {
        classList: {
          add: (value: string) => classes.add(value),
          remove: (...values: string[]) =>
            values.forEach(value => classes.delete(value))
        },
        style: rootStyle
      },
      querySelector: () => ({
        setAttribute: (_name: string, value: string) => {
          themeColor = value;
        }
      })
    }
  });

  return { classes, rootStyle, themeColor };
};

describe('initial theme bootstrap', () => {
  it('applies the saved dark theme before the startup shell', () => {
    const result = runThemeScript('theme-dark');

    assert.equal(result.classes.has('theme-dark'), true);
    assert.equal(result.classes.has('theme-light'), false);
    assert.equal(result.rootStyle.colorScheme, 'dark');
    assert.equal(result.themeColor, '#212531');
  });

  it('falls back to the light theme for an unsupported value', () => {
    const result = runThemeScript('unsupported-theme');

    assert.equal(result.classes.has('theme-light'), true);
    assert.equal(result.rootStyle.colorScheme, 'light');
    assert.equal(result.themeColor, '#f8f9fd');
  });

  it('loads the blocking theme script before the startup shell markup', () => {
    const indexHtml = readFileSync(
      new URL('../index.html', import.meta.url),
      'utf8'
    );
    const scriptPosition = indexHtml.indexOf(
      '<script src="/theme-init.js?v=20260902"></script>'
    );
    const shellPosition = indexHtml.indexOf('<div id="startup-shell"');

    assert.notEqual(scriptPosition, -1);
    assert.ok(scriptPosition < shellPosition);
  });
});
