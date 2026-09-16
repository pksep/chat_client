import {
  defineConfig,
  minimal2023Preset as preset
} from '@vite-pwa/assets-generator/config';

export default defineConfig({
  preset: {
    ...preset,
    transparent: { ...preset.transparent, padding: 0 },
    maskable: {
      ...preset.maskable,
      padding: 0,
      resizeOptions: { background: '#262A38' }
    },
    apple: {
      ...preset.apple,
      padding: 0,
      resizeOptions: { background: '#262A38' }
    }
  },
  // Иконка установленного приложения всегда использует тёмный вариант.
  images: ['public/images/logo-dark.svg']
});
