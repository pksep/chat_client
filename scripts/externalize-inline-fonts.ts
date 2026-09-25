import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import postcss from 'postcss';
import type { Plugin } from 'vite';

// Готовый CSS UI-kit содержит все алфавиты как base64, даже когда они не нужны.
export const externalizeInlineFonts = (): Plugin => {
  let base = '/';
  return {
    name: 'externalize-inline-fonts',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    generateBundle(_options, bundle) {
      const fontFiles = new Map<string, string>();
      const fingerprint = (source: string | Uint8Array) =>
        createHash('sha256').update(source).digest('hex');
      for (const asset of Object.values(bundle)) {
        if (asset.type === 'asset' && /\.woff2?$/.test(asset.fileName)) {
          fontFiles.set(fingerprint(asset.source), asset.fileName);
        }
      }
      for (const asset of Object.values(bundle)) {
        if (asset.type !== 'asset' || !asset.fileName.endsWith('.css'))
          continue;
        const source =
          typeof asset.source === 'string'
            ? asset.source
            : Buffer.from(asset.source).toString('utf8');
        if (!source.includes('data:font/woff')) continue;
        const root = postcss.parse(source);
        root.walkDecls('src', declaration => {
          declaration.value = declaration.value.replace(
            /url\(\s*(['"]?)data:font\/(woff2?);base64,([A-Za-z0-9+/=]+)\1\s*\)/g,
            (_match, _quote, format, encoded) => {
              const bytes = Buffer.from(encoded, 'base64');
              const hash = fingerprint(bytes);
              let fileName = fontFiles.get(hash);
              if (!fileName) {
                fileName = this.getFileName(
                  this.emitFile({
                    type: 'asset',
                    name: `ui-kit-font.${format}`,
                    source: bytes
                  })
                );
                fontFiles.set(hash, fileName);
              }
              const relative = posix.relative(
                posix.dirname(asset.fileName),
                fileName
              );
              const url =
                base === '' || base === './'
                  ? relative.startsWith('.')
                    ? relative
                    : `./${relative}`
                  : `${base}${fileName}`;
              return `url(${url})`;
            }
          );
        });
        // После замены URL одинаковые Inter из приложения и UI-kit становятся дублями.
        const faces = new Set<string>();
        root.walkAtRules('font-face', rule => {
          const declarations: string[] = [];
          rule.walkDecls(declaration => {
            declarations.push(
              `${declaration.prop}:${declaration.value.replace(/["']/g, '')}`
            );
          });
          const key = declarations.sort().join(';');
          if (faces.has(key)) rule.remove();
          else faces.add(key);
        });
        asset.source = root.toString();
      }
    }
  };
};
