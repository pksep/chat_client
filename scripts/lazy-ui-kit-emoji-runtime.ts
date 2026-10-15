import type { Plugin } from 'vite';

// UI-kit поставляется одним модулем: даже закрытая панель заставляла разбирать
// словарь эмодзи и её хранилище при каждом холодном запуске чата.
export const lazyUiKitEmojiRuntime = (): Plugin => {
  const runtimeId = '\0chat-ui-emoji-runtime';
  let runtimeSource = '';
  return {
    name: 'lazy-ui-kit-emoji-runtime',
    apply: 'build',
    enforce: 'pre',
    resolveId(id) {
      if (id === runtimeId) return id;
    },
    load(id) {
      if (id === runtimeId) return runtimeSource;
    },
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('/@pksep/yui/dist/sep-yui.mjs'))
        return;
      const startMatch = code.match(
        /(const|var|,)\s*[A-Za-z_$][\w$]*\s*=\s*"https:\/\/cdn\.jsdelivr\.net\/npm\/emoji-datasource-apple@[^/]+\/img\/apple\/64"/
      );
      const start = startMatch?.index ?? -1;
      const sourcePanelStart = code.indexOf(
        '__name: "EmojiPickerPanel"',
        start
      );
      const componentName = code
        .slice(sourcePanelStart)
        .match(
          /\b[A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*\(([A-Za-z_$][\w$]*)\),\s*\{\s*native:\s*!0/
        )?.[1];
      const componentStart = componentName
        ? code.lastIndexOf(`var ${componentName} = `, sourcePanelStart)
        : -1;
      const componentEnd =
        componentStart >= 0 ? code.indexOf(';\n', componentStart) + 1 : -1;
      const vueImport = code.match(/^import \{[^\n]+\} from "vue";/m)?.[0];
      if (
        start < 0 ||
        sourcePanelStart < start ||
        componentStart < start ||
        componentEnd <= componentStart ||
        !componentName ||
        !vueImport
      ) {
        this.error(
          'Изменилась структура эмодзи в UI-kit: обновите lazy-ui-kit-emoji-runtime для новой версии.'
        );
      }
      const startsInsideDeclaration = startMatch?.[1] === ',';
      const emojiSource = startsInsideDeclaration
        ? `const ${code.slice(start + 1, componentEnd)}`
        : code.slice(start, componentEnd);
      runtimeSource = `${vueImport}\n${emojiSource}\nexport default ${componentName};`;
      const remainder = code.slice(componentEnd);
      const panelStart = remainder.indexOf('__name: "EmojiPickerPanel"');
      const editor = remainder.slice(0, panelStart);
      const panel = remainder.slice(panelStart);
      const identifier = '[A-Za-z_$][\\w$]*';
      const stickerStart = editor.indexOf('__name: "EmojiStickerPicker"');
      const stickerName =
        stickerStart < 0
          ? undefined
          : editor
              .slice(Math.max(0, stickerStart - 200), stickerStart)
              .match(/\b([A-Za-z_$][\w$]*)\s*=\s*[^=]*$/)?.[1];
      const pickerUse = new RegExp(
        stickerName
          ? `\\b${identifier}\\(${stickerName}, \\{`
          : `\\b${identifier}\\(${identifier}\\(${componentName}\\), \\{`,
        'g'
      );
      const panelPickerUse = new RegExp(
        `\\b${identifier}\\(${identifier}\\(${componentName}\\), \\{`,
        'g'
      );
      const patchedEditorReady = editor.match(
        new RegExp(
          `const\\s+(${identifier})\\s*=\\s*${identifier}\\.currentTarget;\\s*` +
            `(${identifier})\\s*=\\s*\\1;\\s*` +
            `const\\s+(${identifier})\\s*=\\s*\\1\\.querySelector\\("\\.emoji-picker"\\);\\s*` +
            `(${identifier})\\s*=\\s*!1,\\s*${identifier}\\s*=\\s*\\[\\],\\s*\\3\\s*&&\\s*` +
            `\\(firstEmojiOpen\\s*&&\\s*\\((${identifier})\\(\\3\\),\\s*(${identifier})\\(\\3\\)\\),\\s*` +
            `(${identifier})\\(\\3\\)\\),\\s*(${identifier})\\(\\1\\),\\s*${identifier}\\.value\\s*=\\s*!0,\\s*` +
            `${identifier}\\(\\(\\)\\s*=>\\s*\\{\\s*\\8\\(\\1\\),\\s*(${identifier})\\(\\1\\);`
        )
      );
      const sourceEditorReady = editor.match(
        new RegExp(
          `const\\s+(${identifier})\\s*=\\s*${identifier}\\.currentTarget;\\s*` +
            `(${identifier})\\s*=\\s*\\1;\\s*` +
            `const\\s+(${identifier})\\s*=\\s*!(${identifier})\\.value;\\s*` +
            `\\4\\.value\\s*=\\s*!0;\\s*` +
            `const\\s+(${identifier})\\s*=\\s*\\1\\.querySelector\\("\\.emoji-picker"\\);\\s*` +
            `(${identifier})\\s*=\\s*!1,\\s*${identifier}\\s*=\\s*\\[\\],\\s*` +
            `\\5\\s*&&\\s*\\3\\s*&&\\s*\\((${identifier})\\(\\5\\),\\s*(${identifier})\\(\\5\\)\\),\\s*` +
            `(${identifier})\\(\\1\\),\\s*${identifier}\\.value\\s*=\\s*!0,\\s*` +
            `${identifier}\\(\\(\\)\\s*=>\\s*\\{\\s*\\9\\(\\1\\),\\s*(${identifier})\\(\\1\\);\\s*` +
            `const\\s+${identifier}\\s*=\\s*\\1\\.querySelector\\("\\.emoji-picker"\\);\\s*` +
            `${identifier}\\s*&&\\s*(${identifier})\\(${identifier}\\);`
        )
      );
      const editorReady = patchedEditorReady
        ? {
            editorButtonRoot: patchedEditorReady[2],
            recentReady: patchedEditorReady[4],
            resetRecent: patchedEditorReady[5],
            resetGroup: patchedEditorReady[6],
            rememberRecent: patchedEditorReady[7],
            positionPicker: patchedEditorReady[8],
            measurePicker: patchedEditorReady[9]
          }
        : sourceEditorReady
          ? {
              editorButtonRoot: sourceEditorReady[2],
              recentReady: sourceEditorReady[6],
              resetRecent: sourceEditorReady[7],
              resetGroup: sourceEditorReady[8],
              rememberRecent: sourceEditorReady[11],
              positionPicker: sourceEditorReady[9],
              measurePicker: sourceEditorReady[10]
            }
          : null;
      const panelReadyName = panel.match(
        new RegExp(
          `return\\s+${identifier}\\(\\(\\)\\s*=>\\s*\\{\\s*${identifier}\\((${identifier})\\);\\s*\\}\\),`
        )
      )?.[1];
      if (
        panelStart < 0 ||
        [...editor.matchAll(pickerUse)].length !== 3 ||
        [...panel.matchAll(panelPickerUse)].length !== 1 ||
        !editorReady ||
        !panelReadyName
      ) {
        this.error('Изменились места подключения панели эмодзи в UI-kit.');
      }
      const {
        editorButtonRoot,
        recentReady,
        resetRecent,
        resetGroup,
        rememberRecent,
        positionPicker,
        measurePicker
      } = editorReady;
      // Инициализация размера, категорий и недавних эмодзи нужна после появления
      // дочернего DOM. nextTick родителя заканчивается раньше асинхронного импорта.
      let editorWithReady = editor.replace(
        pickerUse,
        match => `${match}
        ${stickerName ? 'onReady' : 'onVnodeMounted'}: () => {
          if (!${editorButtonRoot}) return;
          ${positionPicker}(${editorButtonRoot}); ${measurePicker}(${editorButtonRoot});
          const root = ${editorButtonRoot}.querySelector(".emoji-picker");
          if (root) { ${resetRecent}(root); ${resetGroup}(root); ${recentReady} = false; ${rememberRecent}(root); }
        },`
      );
      if (stickerName) {
        const stickerSource = editor.slice(stickerStart);
        const mounted = stickerSource.match(
          new RegExp(
            `return\\s+${identifier}\\((async\\s*\\(\\)\\s*=>\\s*\\{[\\s\\S]*?\\})\\),`
          )
        )?.[1];
        const emitName = stickerSource.match(
          /\b([A-Za-z_$][\w$]*)\("select-sticker",/
        )?.[1];
        const nativePickerUse = new RegExp(
          `\\b${identifier}\\(${identifier}\\(${componentName}\\), ${identifier}\\(${identifier}\\.\\$attrs, \\{`,
          'g'
        );
        if (
          !mounted ||
          !emitName ||
          [...editorWithReady.matchAll(nativePickerUse)].length !== 1
        ) {
          this.error('Изменилось подключение эмодзи внутри панели стикеров.');
        }
        editorWithReady = editorWithReady
          .replace(
            'emits: ["select", "select-sticker"],',
            'emits: ["select", "select-sticker", "ready"],'
          )
          .replace(
            nativePickerUse,
            match => `${match}
              onVnodeMounted: async () => {
                await (${mounted})();
                ${emitName}("ready");
              },`
          );
      }
      // Редактор заранее загружает модуль панели, сохраняя её закрытой.
      editorWithReady = editorWithReady.replace(
        new RegExp(`preloadEmojiPicker: (${identifier})`),
        (_match, preload: string) =>
          `preloadEmojiPicker: () => { void import(${JSON.stringify(runtimeId)}).catch(() => undefined); return ${preload}(); }`
      );
      const panelWithReady = panel.replace(
        panelPickerUse,
        match => `${match} onVnodeMounted: ${panelReadyName},`
      );
      return {
        code:
          'import { defineAsyncComponent as __chatAsyncEmoji } from "vue";\n' +
          code.slice(0, start) +
          (startsInsideDeclaration ? ';\n' : '') +
          `const ${componentName} = __chatAsyncEmoji(() => import(${JSON.stringify(runtimeId)}));\n` +
          editorWithReady +
          panelWithReady,
        map: null
      };
    }
  };
};
