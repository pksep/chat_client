import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { appleSplashScreenSizes } from '@vite-pwa/assets-generator/config';
import {
  createAppleSplashScreenHtmlLink,
  generateMaskableAsset
} from '@vite-pwa/assets-generator/api';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const outputDirectory = resolve(projectRoot, 'public/images/ios-splash');
const sizes = [
  ...new Map(
    Object.values(appleSplashScreenSizes).map(size => [
      `${size.width}x${size.height}@${size.scaleFactor}`,
      size
    ])
  ).values()
];
const links: string[] = [];
await mkdir(outputDirectory, { recursive: true });
let totalBytes = 0;

// iOS выбирает PNG до запуска JavaScript по размеру экрана, ориентации и теме ОС.
for (const portraitSize of sizes) {
  for (const landscape of [false, true]) {
    const size = landscape
      ? {
          ...portraitSize,
          width: portraitSize.height,
          height: portraitSize.width
        }
      : portraitSize;
    for (const theme of ['light', 'dark']) {
      const filename = `${theme}-${size.width}x${size.height}.png`;
      const source = await readFile(
        resolve(projectRoot, `public/images/logo-${theme}.svg`)
      );
      const image = await generateMaskableAsset('png', source, size, {
        // Размер логотипа совпадает с первым кадром HTML: 140 CSS px.
        padding:
          1 - (140 * size.scaleFactor) / Math.min(size.width, size.height),
        resizeOptions: {
          fit: 'contain',
          background: theme === 'dark' ? '#212531' : '#f8f9fd'
        },
        // Индексированная палитра с dithering размывала градиенты логотипа.
        outputOptions: { compressionLevel: 9 }
      });
      const result = await image.toFile(resolve(outputDirectory, filename));
      totalBytes += result.size;
      const link = createAppleSplashScreenHtmlLink('string', {
        size,
        landscape,
        addMediaScreen: true,
        xhtml: true,
        basePath: '/images/ios-splash/',
        name: () => `${filename}?v=20261102`,
        dark: theme === 'dark'
      });
      links.push(
        theme === 'light'
          ? link.replace(
              'media="screen and ',
              'media="screen and (prefers-color-scheme: light) and '
            )
          : link
      );
    }
  }
}

const indexPath = resolve(projectRoot, 'index.html');
const index = await readFile(indexPath, 'utf8');
const region =
  /<!-- ios-startup-images:start -->[\s\S]*?<!-- ios-startup-images:end -->/;
if (!region.test(index))
  throw new Error('Не найдена область стартовых изображений iOS');
await writeFile(
  indexPath,
  index.replace(
    region,
    `<!-- ios-startup-images:start -->\n${links.join('\n')}\n<!-- ios-startup-images:end -->`
  )
);
console.log(
  `Создано ${links.length} стартовых изображений iOS (${Math.round(totalBytes / 1024)} КБ).`
);
