import type { Plugin } from 'vite';

// UI-kit встраивает PDF worker как base64 в общий модуль редактора.
export const externalizeUiKitPdfWorker = (): Plugin => ({
  name: 'externalize-ui-kit-pdf-worker',
  apply: 'build',
  enforce: 'pre',
  transform(code, id) {
    if (!id.replace(/\\/g, '/').endsWith('/@pksep/yui/dist/sep-yui.mjs'))
      return;
    let changed = false;
    const result = code.replace(
      /(["'])data:text\/javascript;base64,([A-Za-z0-9+/=]+)\1/g,
      (literal, _quote, base64) => {
        const source = Buffer.from(base64, 'base64');
        if (!source.includes('WorkerMessageHandler')) return literal;
        const reference = this.emitFile({
          type: 'asset',
          // .js получает корректный MIME и immutable-кеш в существующем nginx.
          name: 'pdf-worker.js',
          source
        });
        changed = true;
        return `import.meta.ROLLUP_FILE_URL_${reference}`;
      }
    );
    return changed ? { code: result, map: null } : undefined;
  }
});
