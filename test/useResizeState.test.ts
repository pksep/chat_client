import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createRenderer } from 'vue';
import { useResizeState } from '../src/composables/useResizeState';

const renderer = createRenderer<object, object>({
  patchProp() {},
  insert() {},
  remove() {},
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  setText() {},
  setElementText() {},
  parentNode: () => null,
  nextSibling: () => null
});

const originalGlobals = new Map(
  ['window', 'document', 'sessionStorage'].map(key => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key)
  ])
);
let testWindow: EventTarget & { innerWidth: number };
let storedStates: Map<string, string>;
let unmount: (() => void) | undefined;

beforeEach(() => {
  testWindow = Object.assign(new EventTarget(), { innerWidth: 768 });
  storedStates = new Map();
  const globals = {
    window: testWindow,
    document: {},
    sessionStorage: {
      getItem: (key: string) => storedStates.get(key) ?? null,
      setItem: (key: string, value: string) => storedStates.set(key, value)
    }
  };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
});

afterEach(() => {
  unmount?.();
  unmount = undefined;
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

function mountResizeState(...args: Parameters<typeof useResizeState>) {
  let result!: ReturnType<typeof useResizeState>;
  let initialState!: boolean;
  const app = renderer.createApp({
    setup() {
      result = useResizeState(...args);
      initialState = result.state.value;
      return () => null;
    }
  });
  app.mount({});
  unmount = () => app.unmount();
  return { ...result, initialState };
}

function resize(width: number) {
  testWindow.innerWidth = width;
  testWindow.dispatchEvent(new Event('resize'));
}

describe('useResizeState', () => {
  test('включает мобильную версию при 768 px до и после монтирования', () => {
    const { state, initialState } = mountResizeState('768px');
    expect(initialState).toBe(true);
    expect(state.value).toBe(true);
    resize(769);
    expect(state.value).toBe(false);
    resize(768);
    expect(state.value).toBe(true);
    resize(767);
    expect(state.value).toBe(true);
  });

  test('сохраняет строгую границу компактного редактора', () => {
    testWindow.innerWidth = 481;
    const { state, initialState } = mountResizeState(481, { inclusive: false });
    expect(initialState).toBe(false);
    expect(state.value).toBe(false);
    resize(480);
    expect(state.value).toBe(true);
    resize(481);
    expect(state.value).toBe(false);
  });

  test('на мобильной границе не перезаписывает desktop-состояние меню', () => {
    storedStates.set('menu-collapse', 'false');
    testWindow.innerWidth = 1024;
    const { state, toggle, setState } = mountResizeState({
      breakpoint: '768px',
      storageKey: 'menu-collapse'
    });
    expect(state.value).toBe(false);
    toggle();
    expect(storedStates.get('menu-collapse')).toBe('true');
    resize(768);
    setState(false);
    expect(storedStates.get('menu-collapse')).toBe('true');
    resize(769);
    expect(state.value).toBe(true);
    setState(false);
    resize(768);
    expect(state.value).toBe(true);
    resize(769);
    expect(state.value).toBe(false);
  });
});
