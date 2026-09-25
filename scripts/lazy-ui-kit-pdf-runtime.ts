import type { Plugin } from 'vite';

// UI-kit 0.1.319 поставляется одним модулем. PDF нужен только при открытии файла,
// но Rollup не может выделить часть уже собранного модуля в отложенный chunk.
export const lazyUiKitPdfRuntime = (): Plugin => {
  const runtimeId = '\0chat-ui-pdf-runtime';
  let runtimeSource = '';
  return {
    name: 'lazy-ui-kit-pdf-runtime',
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
      const pdfStartMatch = code.match(
        /,\s*([A-Za-z_$][\w$]*)\s*=\s*typeof process/
      );
      const start = pdfStartMatch?.index ?? -1;
      const globalExport = code.indexOf('globalThis.pdfjsLib = {', start);
      const end = code.indexOf('\n};', globalExport) + 3;
      const exportBlock =
        globalExport >= 0 && end > globalExport
          ? code.slice(globalExport, end)
          : '';
      const getDocumentName = exportBlock.match(
        /\bgetDocument:\s*([A-Za-z_$][\w$]*)/
      )?.[1];
      const globalWorkerOptionsName = exportBlock.match(
        /\bGlobalWorkerOptions:\s*([A-Za-z_$][\w$]*)/
      )?.[1];
      const isPdfName = exportBlock.match(
        /\bisPdfFile:\s*([A-Za-z_$][\w$]*)/
      )?.[1];
      const isPdfStart = isPdfName
        ? code.indexOf(`function ${isPdfName}(`, start)
        : -1;
      const isPdfEnd =
        isPdfStart >= 0 ? code.indexOf('\n}', isPdfStart) + 2 : -1;
      const isPdf =
        isPdfStart >= 0 && isPdfEnd > isPdfStart
          ? code.slice(isPdfStart, isPdfEnd)
          : '';
      const workerSourceName = code
        .slice(Math.max(0, start - 500), start)
        .match(
          /([A-Za-z_$][\w$]*)\s*=\s*import\.meta\.ROLLUP_FILE_URL_[A-Za-z0-9_$]+\s*$/
        )?.[1];
      const helperSource = code.slice(0, 2_000);
      const helpers = [
        helperSource.match(
          /\bvar\s+([A-Za-z_$][\w$]*)\s*=\s*\(C,\s*g,\s*I\)\s*=>\s*[A-Za-z_$][\w$]*\(C,\s*typeof g/
        )?.[1],
        helperSource.match(
          /\b([A-Za-z_$][\w$]*)\s*=\s*\(C,\s*g,\s*I\)\s*=>\s*\([A-Za-z_$][\w$]*\(C,\s*g,\s*"read from private field"/
        )?.[1],
        helperSource.match(
          /\b([A-Za-z_$][\w$]*)\s*=\s*\(C,\s*g,\s*I\)\s*=>\s*g\.has\(C\)\s*\?\s*[A-Za-z_$][\w$]*\("Cannot add the same private member more than once"/
        )?.[1],
        helperSource.match(
          /\b([A-Za-z_$][\w$]*)\s*=\s*\(C,\s*g,\s*I,\s*e\)\s*=>\s*\([A-Za-z_$][\w$]*\(C,\s*g,\s*"write to private field"/
        )?.[1],
        helperSource.match(
          /\b([A-Za-z_$][\w$]*)\s*=\s*\(C,\s*g,\s*I\)\s*=>\s*\([A-Za-z_$][\w$]*\(C,\s*g,\s*"access private method"/
        )?.[1],
        helperSource.match(
          /\bvar\s+([A-Za-z_$][\w$]*)\s*=\s*\(C,\s*g,\s*I,\s*e\)\s*=>\s*\(\{\s*set _/
        )?.[1]
      ];
      if (
        start < 0 ||
        globalExport < start ||
        end <= globalExport ||
        !isPdf ||
        !getDocumentName ||
        !globalWorkerOptionsName ||
        !workerSourceName ||
        helpers.some(name => !name)
      ) {
        this.error(
          'Изменилась структура PDF в UI-kit: обновите lazy-ui-kit-pdf-runtime для новой версии.'
        );
      }
      // Общие транспилированные помощники остаются единственными экземплярами.
      const helperNames = helpers as string[];
      runtimeSource =
        `import { ${helperNames.map(name => `__chatPdf_${name} as ${name}`).join(', ')} } from ${JSON.stringify(id)};\n` +
        `const ${code.slice(start + 2, end)}\nexport { ${getDocumentName} as getDocument, ${globalWorkerOptionsName} as GlobalWorkerOptions };`;
      const loader = `;
const ${globalWorkerOptionsName} = { workerSrc: ${workerSourceName} };
const ${getDocumentName} = (...args) => ({
  promise: import(${JSON.stringify(runtimeId)}).then(runtime => {
    runtime.GlobalWorkerOptions.workerSrc = ${globalWorkerOptionsName}.workerSrc;
    return runtime.getDocument(...args).promise;
  })
});
${isPdf}
`;
      return {
        code:
          code.slice(0, start) +
          loader +
          code.slice(end) +
          `\nexport { ${helperNames.map(name => `${name} as __chatPdf_${name}`).join(', ')} };`,
        map: null
      };
    }
  };
};
