import type { Plugin } from 'vite';
import type { Node, Program } from 'estree';
import { analyze } from 'eslint-scope';

type SourceNode = Node & { start: number; end: number };
type Unit = {
  node: SourceNode;
  names: Set<string>;
  dependencies: Set<Unit>;
};

// UI-kit 0.1.319 объединяет редактор с компонентами списка. Сохраняем его
// внутреннюю инициализацию и порядок, а общие зависимости оставляем в одном
// экземпляре. Области видимости определяет AST, а не имена внутри строк/шаблонов.
export const lazyUiKitEditorRuntime = (): Plugin => {
  const runtimeId = '\0chat-ui-editor-runtime';
  let runtimeSource = '';
  return {
    name: 'lazy-ui-kit-editor-runtime',
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
      const ast = this.parse(code) as unknown as Program;
      const addRanges = (value: unknown): void => {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) return value.forEach(addRanges);
        const node = value as Record<string, unknown>;
        if (typeof node.type === 'string') {
          node.range = [node.start, node.end];
          Object.entries(node).forEach(([key, child]) => {
            if (key !== 'range') addRanges(child);
          });
        }
      };
      addRanges(ast);
      const scope = analyze(ast, {
        ecmaVersion: 2022,
        sourceType: 'module',
        optimistic: true,
        ignoreEval: true
      }).scopes.find(scope => scope.type === 'module');
      if (!scope) this.error('Не удалось разобрать область видимости UI-kit.');
      const units: Unit[] = ast.body.flatMap(statement =>
        (statement.type === 'VariableDeclaration'
          ? statement.declarations
          : [statement]
        ).map(node => ({
          node: node as SourceNode,
          names: new Set<string>(),
          dependencies: new Set<Unit>()
        }))
      );
      const at = (node: Node): Unit => {
        const position = (node as SourceNode).start;
        let low = 0;
        let high = units.length;
        while (low < high) {
          const middle = (low + high) >>> 1;
          if (units[middle].node.end <= position) low = middle + 1;
          else high = middle;
        }
        const unit = units[low];
        if (!unit || unit.node.start > position)
          this.error('Не найдена декларация зависимости редактора UI-kit.');
        return unit;
      };
      const bindings = new Map<string, Unit>();
      for (const variable of scope.variables) {
        const definition = variable.identifiers[0];
        if (!definition) continue;
        const unit = at(definition);
        bindings.set(variable.name, unit);
        unit.names.add(variable.name);
        for (const reference of variable.references) {
          const reader = at(reference.identifier);
          if (reader !== unit) reader.dependencies.add(unit);
        }
      }
      const sourceOf = (unit: Unit) =>
        code.slice(unit.node.start, unit.node.end);
      const first = units.find(unit =>
        /^function [A-Za-z_$][\w$]*\(([A-Za-z_$][\w$]*)\) \{\s*this\.content = \1;\s*\}$/.test(
          sourceOf(unit)
        )
      );
      const editorName = code.match(
        /\b([A-Za-z_$][\w$]*) as ContentEditor,/
      )?.[1];
      const toolbarName = code.match(
        /\b([A-Za-z_$][\w$]*) as ContentEditorFormattingToolbar,/
      )?.[1];
      const editor = editorName ? bindings.get(editorName) : undefined;
      const toolbar = toolbarName ? bindings.get(toolbarName) : undefined;
      if (
        !first ||
        !editor ||
        !toolbar ||
        !editorName ||
        !toolbarName ||
        !sourceOf(editor).includes('__name: "ContentEditor"') ||
        !code.includes(`${editorName} as ContentEditor,`) ||
        !code.includes(`${toolbarName} as ContentEditorFormattingToolbar,`)
      ) {
        this.error(
          'Изменилась структура UI-kit: обновите отложенную загрузку редактора.'
        );
      }
      const proxies = new Set([editor, toolbar]);
      const range = new Set(
        units.filter(
          unit =>
            unit.node.start >= first.node.start &&
            unit.node.end <= editor.node.end
        )
      );
      const shared = new Set<Unit>();
      const keep = (unit: Unit): void => {
        if (!range.has(unit) || shared.has(unit) || proxies.has(unit)) return;
        shared.add(unit);
        unit.dependencies.forEach(keep);
      };
      units
        .filter(unit => !range.has(unit))
        .forEach(unit => unit.dependencies.forEach(keep));
      // Присваивания prototype/регистрации тоже принадлежат своим декларациям.
      // Если общий компонент читает такую декларацию, её инициализация остаётся.
      let previousSize = -1;
      while (previousSize !== shared.size) {
        previousSize = shared.size;
        for (const unit of range) {
          if (
            !unit.names.size &&
            [...unit.dependencies].some(dep => shared.has(dep))
          )
            keep(unit);
        }
      }
      const moved = new Set([...range].filter(unit => !shared.has(unit)));
      for (const variable of scope.variables) {
        const owner = bindings.get(variable.name);
        if (!owner) continue;
        for (const reference of variable.references) {
          if (
            reference.isWrite() &&
            moved.has(at(reference.identifier)) !== moved.has(owner)
          )
            this.error(
              `Изменяемая зависимость ${variable.name} пересекает границу редактора.`
            );
        }
      }
      if (
        [...moved].reduce(
          (size, unit) => size + unit.node.end - unit.node.start,
          0
        ) < 700_000
      )
        this.error('Редактор перестал отделяться от стартового UI-kit.');
      const imports = new Set(
        [...moved]
          .flatMap(unit => [...unit.dependencies])
          .filter(unit => !moved.has(unit))
          .flatMap(unit => [...unit.names])
      );
      const runtime: string[] = [];
      const edits: { start: number; end: number; value: string }[] = [];
      for (const statement of ast.body) {
        const source = statement as SourceNode;
        if (statement.type === 'VariableDeclaration') {
          const declarations = statement.declarations;
          if (!declarations.some(node => moved.has(at(node)))) continue;
          const kept: string[] = [];
          for (const node of declarations) {
            const unit = at(node);
            const declaration = code.slice(unit.node.start, unit.node.end);
            if (!moved.has(unit)) {
              kept.push(declaration);
              continue;
            }
            runtime.push(`${statement.kind} ${declaration};`);
            if (proxies.has(unit)) {
              const name = [...unit.names][0];
              kept.push(
                `${name} = __chatAsyncEditor(() => import(${JSON.stringify(runtimeId)}).then(runtime => runtime.${name}))`
              );
            }
          }
          edits.push({
            start: source.start,
            end: source.end,
            value: kept.length ? `${statement.kind} ${kept.join(', ')};` : ''
          });
        } else if (moved.has(at(statement))) {
          runtime.push(code.slice(source.start, source.end));
          edits.push({ start: source.start, end: source.end, value: '' });
        }
      }
      const importNames = [...imports];
      runtimeSource =
        `import { ${importNames.map(name => `__chatEditor_${name} as ${name}`).join(', ')} } from ${JSON.stringify(id)};\n` +
        runtime.join('\n') +
        `\nexport { ${editorName}, ${toolbarName} };`;
      for (const edit of edits.reverse())
        code = code.slice(0, edit.start) + edit.value + code.slice(edit.end);
      return {
        code:
          'import { defineAsyncComponent as __chatAsyncEditor } from "vue";\n' +
          code +
          `\nexport { ${importNames.map(name => `${name} as __chatEditor_${name}`).join(', ')} };`,
        map: null
      };
    }
  };
};
