import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { RouteTypes } from '../src/composables/navigation/useUrlRouting';

const scriptFrom = (path: string): ts.SourceFile => {
  const component = readFileSync(new URL(path, import.meta.url), 'utf8');
  const script = component.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1];

  if (!script) throw new Error('Не найден скрипт проверяемого компонента');

  return ts.createSourceFile(path, script, ts.ScriptTarget.Latest, true);
};

const aiScript = scriptFrom('../src/components/Chat.vue');
const menuScript = scriptFrom('../src/components/Menu/MenuBottomNav.vue');

const findGuard = (script: ts.SourceFile, name: string): string => {
  for (const statement of script.statements) {
    if (!ts.isVariableStatement(statement)) continue;

    for (const declaration of statement.declarationList.declarations) {
      if (
        declaration.name.getText(script) === name &&
        declaration.initializer
      ) {
        return declaration.initializer.getText(script);
      }
    }
  }

  throw new Error(`Не найден обработчик ${name}`);
};

const findClientGuard = (): string => {
  for (const statement of menuScript.statements) {
    if (!ts.isExpressionStatement(statement)) continue;

    const call = statement.expression;

    if (
      ts.isCallExpression(call) &&
      call.expression.getText(menuScript) === 'watch' &&
      call.arguments[0]
        ?.getText(menuScript)
        .includes('managerAccessResolved') &&
      call.arguments[1]
    ) {
      return call.arguments[1].getText(menuScript);
    }
  }

  throw new Error('Не найден обработчик отзыва доступа к клиентам');
};

const transpileGuard = (source: string): string =>
  ts.transpile(`return (${source});`, { target: ts.ScriptTarget.ES2022 });

describe('совместимость защиты разделов с общими правами Chat', () => {
  for (const routeType of [RouteTypes.AI, RouteTypes.ASSISTANT]) {
    for (const [ready, allowed, redirects] of [
      [false, false, 0],
      [true, true, 0],
      [true, false, 1]
    ] as const) {
      test(`${routeType}: подтверждение=${ready}, допуск=${allowed}`, () => {
        const sections: string[] = [];
        let navigations = 0;
        const createGuard = new Function(
          'route',
          'RouteTypes',
          'isChatAccessReady',
          'chatAccess',
          'setActiveSection',
          'navigateToDefault',
          transpileGuard(findGuard(aiScript, 'guardAiRoute'))
        );
        const guard: () => void = createGuard(
          { value: { type: routeType } },
          RouteTypes,
          { value: ready },
          { value: { ai: allowed } },
          (section: string): void => {
            sections.push(section);
          },
          (): void => {
            navigations++;
          }
        );

        guard();

        expect(navigations).toBe(redirects);
        expect(sections).toEqual(redirects ? ['chats'] : []);
      });
    }
  }

  for (const [ready, access, resolved, allowed, section, redirects] of [
    [false, false, false, false, 'clients', 0],
    [true, true, false, false, 'clients', 0],
    [true, true, true, true, 'clients', 0],
    [true, false, true, false, 'clients', 1],
    [true, true, true, false, 'clients', 1],
    [true, false, true, false, 'chats', 0]
  ] as const) {
    test(`клиенты: ${[ready, access, resolved, allowed, section].join('/')}`, () => {
      const sections: string[] = [];
      let navigations = 0;
      const createGuard = new Function(
        'setActiveSection',
        'navigateToDefault',
        transpileGuard(findClientGuard())
      );
      const guard: (
        state: readonly [boolean, boolean, boolean, boolean, string]
      ) => void = createGuard(
        (next: string): void => {
          sections.push(next);
        },
        (): void => {
          navigations++;
        }
      );

      guard([ready, access, resolved, allowed, section]);

      expect(navigations).toBe(redirects);
      expect(sections).toEqual(redirects ? ['chats'] : []);
    });
  }
});
