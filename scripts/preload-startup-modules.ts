import type { HtmlTagDescriptor, Plugin } from 'vite';

// Загружаем обязательный граф main, пока native-мост выбирает маршрут.
// modulepreload не выполняет код: чтение маршрута остаётся после native-ready.
export const preloadStartupModules = (): Plugin => {
  let base = '/';
  return {
    name: 'preload-startup-modules',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        const bundle = context.bundle;
        if (!bundle) return;
        const main = Object.values(bundle).find(
          chunk =>
            chunk.type === 'chunk' &&
            chunk.moduleIds.some(id =>
              id.replace(/\\/g, '/').endsWith('/src/main.ts')
            )
        );
        if (!main || main.type !== 'chunk') return;
        const visited = new Set<string>();
        const styles = new Set<string>();
        const visit = (fileName: string) => {
          if (visited.has(fileName)) return;
          const chunk = bundle[fileName];
          if (!chunk || chunk.type !== 'chunk') return;
          visited.add(fileName);
          chunk.imports.forEach(visit);
          const metadata = chunk as typeof chunk & {
            viteMetadata?: { importedCss: Set<string> };
          };
          metadata.viteMetadata?.importedCss.forEach(css => styles.add(css));
        };
        visit(main.fileName);
        const tags: HtmlTagDescriptor[] = [];
        for (const fileName of [...visited, ...styles]) {
          const href = `${base}${fileName}`;
          if (html.includes(`href="${href}"`)) continue;
          tags.push({
            tag: 'link',
            attrs: {
              // Стили начнут загружаться сразу; Vite применит их перед main.
              // stylesheet здесь блокировал первый кадр с логотипом PWA.
              rel: styles.has(fileName) ? 'preload' : 'modulepreload',
              ...(styles.has(fileName) ? { as: 'style' } : {}),
              crossorigin: true,
              href
            },
            injectTo: 'head'
          });
        }
        return tags;
      }
    }
  };
};
