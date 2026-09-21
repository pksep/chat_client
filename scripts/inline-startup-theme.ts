import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

// Тема нужна до первого кадра; отдельный запрос задерживает парсер Android WebView.
export const inlineStartupTheme = (): Plugin => {
  let publicDir = '';
  return {
    name: 'inline-startup-theme',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    transformIndexHtml: {
      order: 'post',
      async handler(html) {
        const themeTag =
          /<script\s+src="[^"]*\/theme-init\.js(?:\?[^"]*)?"\s*><\/script>/;
        if (!themeTag.test(html)) return html;
        const source = (
          await readFile(resolve(publicDir, 'theme-init.js'), 'utf8')
        ).replace(/\r\n?/g, '\n');
        if (/<\/script/i.test(source))
          throw new Error('Недопустимый HTML в скрипте темы');
        const hash = createHash('sha256').update(source).digest('base64');
        const csp =
          /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]+)("\s*\/?>)/;
        let authorized = false;
        const result = html.replace(csp, (_match, prefix, policy, suffix) => {
          const updated = policy.replace(
            /(^|;)\s*script-src\s+([^;]+)/,
            (_directive: string, separator: string, sources: string) => {
              authorized = true;
              return `${separator} script-src ${sources.trim()} 'sha256-${hash}'`;
            }
          );
          return `${prefix}${updated}${suffix}`;
        });
        if (!authorized)
          throw new Error(
            'Не найдена CSP-директива script-src для скрипта темы'
          );
        return result.replace(
          themeTag,
          () => `<script data-startup-theme>${source}</script>`
        );
      }
    }
  };
};
