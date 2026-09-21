import type { Plugin } from 'vite';
import type { Node, Program } from 'estree';
import { analyze } from 'eslint-scope';

type SourceNode = Node & { start: number; end: number };
type Unit = {
  node: SourceNode;
  names: Set<string>;
  dependencies: Set<Unit>;
};

// UI-kit поставляет медиаслайдер вместе со всем синхронным модулем. Его
// реализация и библиотеки печати/масштабирования нужны только после открытия
// вложения, поэтому оставляем в основном модуле лёгкий async-компонент.
export const lazyUiKitSliderRuntime = (): Plugin => {
  const runtimeId = '\0chat-ui-slider-runtime';
  let runtimeSource = '';

  return {
    name: 'lazy-ui-kit-slider-runtime',
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
      }).scopes.find(candidate => candidate.type === 'module');
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
          this.error('Не найдена декларация зависимости слайдера UI-kit.');
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
      const sliderName = code.match(
        /\b([A-Za-z_$][\w$]*) as SliderModal,/
      )?.[1];
      const slider = sliderName ? bindings.get(sliderName) : undefined;
      const first = slider
        ? units
            .filter(
              unit =>
                unit.node.start < slider.node.start &&
                /^[A-Za-z_$][\w$]* = \{ exports: \{\} \}$/.test(sourceOf(unit))
            )
            .at(-1)
        : undefined;
      if (
        !first ||
        !slider ||
        !sliderName ||
        !code.includes(`${sliderName} as SliderModal,`)
      ) {
        this.error(
          'Изменилась структура UI-kit: обновите отложенную загрузку медиаслайдера.'
        );
      }

      const proxies = new Set([slider]);
      const range = new Set(
        units.filter(
          unit =>
            unit.node.start >= first.node.start &&
            unit.node.end <= slider.node.end
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

      let previousSize = -1;
      while (previousSize !== shared.size) {
        previousSize = shared.size;
        for (const unit of range) {
          if (
            !unit.names.size &&
            [...unit.dependencies].some(dependency => shared.has(dependency))
          ) {
            keep(unit);
          }
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
          ) {
            this.error(
              `Изменяемая зависимость ${variable.name} пересекает границу медиаслайдера.`
            );
          }
        }
      }

      if (
        [...moved].reduce(
          (size, unit) => size + unit.node.end - unit.node.start,
          0
        ) < 30_000
      ) {
        this.error('Медиаслайдер перестал отделяться от стартового UI-kit.');
      }

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
                `${name} = __chatAsyncSlider(() => import(${JSON.stringify(runtimeId)}).then(runtime => runtime.${name}))`
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
        `import { ${importNames.map(name => `__chatSlider_${name} as ${name}`).join(', ')} } from ${JSON.stringify(id)};\n` +
        runtime.join('\n') +
        `\nexport { ${sliderName} };`;
      for (const edit of edits.reverse()) {
        code = code.slice(0, edit.start) + edit.value + code.slice(edit.end);
      }

      return {
        code:
          'import { defineAsyncComponent as __chatAsyncSlider } from "vue";\n' +
          code +
          `\nexport { ${importNames.map(name => `${name} as __chatSlider_${name}`).join(', ')} };`,
        map: null
      };
    }
  };
};
