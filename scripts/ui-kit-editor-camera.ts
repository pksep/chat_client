import type { Plugin } from 'vite';

// В текущем UI-kit нет настройки видимости камеры в меню вложений.
export const uiKitEditorCamera = (): Plugin => ({
  name: 'ui-kit-editor-camera',
  enforce: 'pre',
  transform(code, id) {
    if (
      !id
        .split('?')[0]
        .replace(/\\/g, '/')
        .endsWith('/@pksep/yui/dist/sep-yui.mjs')
    )
      return;

    const cameraOption =
      /\{\s*value: "Камера",\s*function: [\w$]+,\s*iconName: [\w$]+\.camera\s*\}/g;
    const matches = [...code.matchAll(cameraOption)];
    if (matches.length !== 1)
      this.error(
        'Изменилась структура UI-kit: обновите условие показа камеры.'
      );

    return {
      code:
        'import { Capacitor as __chatCapacitor } from "@capacitor/core";\n' +
        code.replace(
          cameraOption,
          option =>
            `...(__chatCapacitor.isNativePlatform() && __chatCapacitor.getPlatform() === "android" ? [${option}] : [])`
        ),
      map: null
    };
  }
});
