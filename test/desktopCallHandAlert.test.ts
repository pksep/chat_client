import { expect, test } from 'bun:test';
import { createDesktopCallHandAlert } from '../src/services/desktop-call-hand-alert';

function fixture(state = 'running') {
  const attention: Array<number | null> = [];
  let started = 0;
  let closed = 0;
  class AudioContext {
    state = state;
    currentTime = 0;
    destination = {};
    resume = async () => {};
    close = async () => {
      closed++;
    };
    createOscillator() {
      return {
        frequency: { setValueAtTime() {} },
        connect(node: unknown) {
          return node;
        },
        disconnect() {},
        start() {
          started++;
        },
        stop() {}
      };
    }
    createGain() {
      return {
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        disconnect() {}
      };
    }
  }
  const alert = createDesktopCallHandAlert({
    renderWindow: {
      AudioContext,
      addEventListener() {},
      removeEventListener() {}
    } as any,
    nativeWindow: {
      requestUserAttention: async value => {
        attention.push(value);
      }
    }
  });
  return {
    alert,
    attention,
    get started() {
      return started;
    },
    get closed() {
      return closed;
    }
  };
}

test('рука просит внимание без активации окна, серия событий звучит один раз', () => {
  const f = fixture();
  expect(f.alert.play()).toBe(true);
  expect(f.started).toBe(2);
  expect(f.alert.play()).toBe(true);
  expect(f.started).toBe(2);
  expect(f.attention).toEqual([2, 2]);
  f.alert.clearAttention();
  expect(f.attention.at(-1)).toBeNull();
  f.alert.dispose();
  f.alert.dispose();
  expect(f.closed).toBe(1);
  expect(f.alert.play()).toBe(false);
  expect(f.started).toBe(2);
});

test('запрет автозвука не блокирует значок и оставляет системный звук toast', () => {
  const f = fixture('suspended');
  expect(f.alert.play()).toBe(false);
  expect(f.started).toBe(0);
  expect(f.attention).toEqual([2]);
  f.alert.dispose();
});
