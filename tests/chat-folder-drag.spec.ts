import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { effectScope, markRaw, shallowRef } from 'vue';
import { useChatFolderDrag } from '../src/composables/useChatFolderDrag';
import type { ChatFolder } from '../src/services/useChatSDK/chat-folder';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
});

const createHarness = (horizontal = false) => {
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const window = new EventTarget();
  const install = (key: string, value: unknown) => {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value
    });
  };
  install('window', window);
  install('document', { body: { appendChild: () => {} } });
  install('getComputedStyle', () =>
    Object.assign(['background-color'], {
      getPropertyValue: () => 'white'
    })
  );
  install('requestAnimationFrame', () => 1);
  install('cancelAnimationFrame', () => {});
  const folders = shallowRef<ChatFolder[]>(
    ['a', 'b', 'c'].map(id => ({
      id,
      name: id,
      icon: 'folder',
      topicIds: [],
      createdAt: '2026-10-02',
      updatedAt: '2026-10-02'
    }))
  );
  let disabled = false;
  const commits: string[][] = [];
  const scope = effectScope();
  const drag = scope.run(() =>
    useChatFolderDrag({
      folders: () => folders.value,
      disabled: () => disabled,
      horizontal: () => horizontal,
      onReorder: ids => {
        commits.push(ids);
      }
    })
  )!;
  const elements = new Map<string, any>();
  for (const id of ['a', 'b', 'c', 'all', 'manage']) {
    const element = markRaw({
      dataset: { folderId: ['all', 'manage'].includes(id) ? undefined : id },
      closest: () => (element.dataset.folderId ? element : null),
      querySelectorAll: () => [],
      getBoundingClientRect: () => {
        const index = drag.orderedFolders.value.findIndex(
          folder => folder.id === id
        );
        return horizontal
          ? {
              left: index * 20,
              right: index * 20 + 20,
              top: 0,
              bottom: 20,
              width: 20,
              height: 20
            }
          : {
              left: 0,
              right: 20,
              top: index * 20,
              bottom: index * 20 + 20,
              width: 20,
              height: 20
            };
      },
      cloneNode: () => ({
        style: {},
        classList: { add: () => {} },
        setAttribute: () => {},
        removeAttribute: () => {},
        querySelectorAll: () => [],
        remove: () => {}
      })
    });
    elements.set(id, element);
  }
  drag.containerRef.value = markRaw({
    contains: (element: unknown) => [...elements.values()].includes(element),
    querySelectorAll: () =>
      drag.orderedFolders.value.map(folder => elements.get(folder.id)),
    getBoundingClientRect: () => ({
      left: 0,
      right: horizontal ? 60 : 20,
      top: 0,
      bottom: horizontal ? 20 : 60
    }),
    scrollLeft: 0,
    scrollTop: 0
  }) as unknown as HTMLElement;
  const event = (type: string, fields: Record<string, unknown>, id = 'a') => {
    const value = Object.assign(new Event(type, { cancelable: true }), fields);
    Object.defineProperty(value, 'target', { value: elements.get(id) });
    return value;
  };
  const pointerDown = (id = 'a') =>
    drag.onPointerDown(
      event(
        'pointerdown',
        {
          pointerId: 1,
          pointerType: 'mouse',
          button: 0,
          clientX: 10,
          clientY: 10
        },
        id
      ) as unknown as PointerEvent
    );
  const pointerMove = (x: number, y: number) =>
    window.dispatchEvent(
      event('pointermove', {
        pointerId: 1,
        clientX: x,
        clientY: y
      })
    );
  const touch = (x: number, y: number) => ({
    identifier: 1,
    clientX: x,
    clientY: y
  });
  const touchStart = () =>
    drag.onTouchStart(
      event('touchstart', { touches: [touch(10, 10)] }) as unknown as TouchEvent
    );
  const touchMove = (x: number, y: number) => {
    const value = event('touchmove', { touches: [touch(x, y)] });
    window.dispatchEvent(value);
    return value;
  };
  const touchEnd = () =>
    window.dispatchEvent(
      event('touchend', { changedTouches: [touch(55, 55)] })
    );
  dispose = () => {
    scope.stop();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  };
  return {
    drag,
    elements,
    commits,
    window,
    event,
    pointerDown,
    pointerMove,
    touchStart,
    touchMove,
    touchEnd,
    disable: () => {
      disabled = true;
    }
  };
};

const hold = () => new Promise(resolve => setTimeout(resolve, 375));

describe('Перетаскивание папок', () => {
  it('обычное нажатие не изменяет порядок и не блокирует выбор', () => {
    const h = createHarness();
    h.pointerDown();
    h.pointerMove(12, 12);
    h.window.dispatchEvent(h.event('pointerup', { pointerId: 1 }));
    const click = h.event('click', {});
    h.drag.onClickCapture(click);
    assert.equal(click.defaultPrevented, false);
    assert.deepEqual(h.commits, []);
  });

  it('перетаскивает мышью и не открывает папку после отпускания', () => {
    const h = createHarness();
    h.pointerDown();
    h.pointerMove(10, 55);
    assert.deepEqual(
      h.drag.orderedFolders.value.map(folder => folder.id),
      ['b', 'c', 'a']
    );
    h.window.dispatchEvent(h.event('pointerup', { pointerId: 1 }));
    assert.deepEqual(h.commits, [['b', 'c', 'a']]);
    const click = h.event('click', {});
    h.drag.onClickCapture(click);
    assert.equal(click.defaultPrevented, true);
    assert.equal(h.drag.draggedFolderId.value, null);
  });

  it('отменяет перетаскивание по Escape без сохранения', () => {
    const h = createHarness();
    h.pointerDown();
    h.pointerMove(10, 55);
    h.window.dispatchEvent(h.event('keydown', { key: 'Escape' }));
    assert.deepEqual(h.commits, []);
    assert.deepEqual(
      h.drag.orderedFolders.value.map(folder => folder.id),
      ['a', 'b', 'c']
    );
  });

  for (const horizontal of [false, true]) {
    it(`анимация соседей не вызывает дрожание ${horizontal ? 'по горизонтали' : 'по вертикали'}`, () => {
      const h = createHarness(horizontal);
      const container = h.drag.containerRef.value!;
      Object.assign(container, { clientLeft: 0, clientTop: 0 });
      for (const [id, element] of h.elements) {
        Object.assign(element, {
          offsetParent: container,
          offsetWidth: 20,
          offsetHeight: 20
        });
        for (const property of ['offsetTop', 'offsetLeft']) {
          Object.defineProperty(element, property, {
            get: () => {
              const index = h.drag.orderedFolders.value.findIndex(
                folder => folder.id === id
              );
              return property === (horizontal ? 'offsetLeft' : 'offsetTop')
                ? index * 20
                : 0;
            }
          });
        }
      }
      h.pointerDown();
      h.pointerMove(horizontal ? 55 : 10, horizontal ? 10 : 55);
      // Соседи ещё визуально на старом месте, хотя DOM уже переставлен.
      h.elements.get('c').getBoundingClientRect = () => ({
        left: horizontal ? 40 : 0,
        top: horizontal ? 0 : 40,
        width: 20,
        height: 20
      });
      h.pointerMove(horizontal ? 48 : 10, horizontal ? 10 : 48);
      assert.deepEqual(
        h.drag.orderedFolders.value.map(folder => folder.id),
        ['b', 'c', 'a']
      );
    });
  }

  it('на десктопе горизонтальное движение не начинает перетаскивание', () => {
    const h = createHarness();
    h.pointerDown();
    h.pointerMove(55, 10);
    assert.equal(h.drag.draggedFolderId.value, null);
    h.window.dispatchEvent(h.event('pointerup', { pointerId: 1 }));
    assert.deepEqual(h.commits, []);
  });

  it('в горизонтальной полосе вертикальное движение не начинает перетаскивание', () => {
    const h = createHarness(true);
    h.pointerDown();
    h.pointerMove(10, 55);
    assert.equal(h.drag.draggedFolderId.value, null);
    h.window.dispatchEvent(h.event('pointerup', { pointerId: 1 }));
    assert.deepEqual(h.commits, []);
  });

  it('свайп до удержания остаётся нативной прокруткой', async () => {
    const h = createHarness(true);
    h.touchStart();
    assert.equal(h.touchMove(35, 10).defaultPrevented, false);
    await hold();
    assert.equal(h.drag.draggedFolderId.value, null);
    h.touchEnd();
    assert.deepEqual(h.commits, []);
  });

  for (const horizontal of [false, true]) {
    it(`после удержания переносит касанием ${horizontal ? 'горизонтально' : 'вертикально'}`, async () => {
      const h = createHarness(horizontal);
      h.touchStart();
      await hold();
      assert.equal(h.drag.draggedFolderId.value, 'a');
      const move = horizontal ? h.touchMove(55, 10) : h.touchMove(10, 55);
      assert.equal(move.defaultPrevented, true);
      h.touchEnd();
      assert.deepEqual(h.commits, [['b', 'c', 'a']]);
    });
  }

  it('системная отмена жеста не сохраняет промежуточный порядок', async () => {
    const h = createHarness();
    h.touchStart();
    await hold();
    h.touchMove(10, 55);
    h.window.dispatchEvent(new Event('touchcancel'));
    assert.deepEqual(h.commits, []);
    assert.equal(h.drag.draggedFolderId.value, null);
  });

  it('служебные кнопки и заблокированное сохранение не перетаскиваются', () => {
    const h = createHarness();
    for (const id of ['all', 'manage']) {
      h.pointerDown(id);
      h.pointerMove(10, 55);
    }
    h.disable();
    h.pointerDown();
    h.pointerMove(10, 55);
    assert.equal(h.drag.draggedFolderId.value, null);
    assert.deepEqual(h.commits, []);
  });

  it('поддерживает изменение порядка с клавиатуры', () => {
    const h = createHarness();
    h.drag.onKeydown(
      h.event('keydown', {
        altKey: true,
        key: 'ArrowDown'
      }) as unknown as KeyboardEvent
    );
    assert.deepEqual(h.commits, [['b', 'a', 'c']]);
  });
});
