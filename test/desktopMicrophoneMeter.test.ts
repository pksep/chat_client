import { expect, test } from 'bun:test';
import { ref } from 'vue';
import { createDesktopMicrophoneMeter } from '../src/services/desktop-microphone-meter';

function fixture(initialState = 'running', pendingResume = false) {
  const enabled = ref(false);
  let track: any = {
    readyState: 'live',
    enabled: true,
    stop() {
      throw new Error('Нельзя останавливать RTC-track');
    }
  };
  let now = 0;
  let resumeCalls = 0;
  let closed = 0;
  let detached = 0;
  const streams: unknown[][] = [];
  const frames = new Map<number, FrameRequestCallback>();
  const events = new Map<string, EventListener>();
  let id = 0;
  const sinks: any[] = [];
  let context: any;
  class Context {
    state = initialState;
    currentTime = 0;
    destination = {};
    constructor() {
      context = this;
    }
    resume() {
      resumeCalls++;
      if (pendingResume && resumeCalls === 1)
        return new Promise<void>(() => {});
      this.state = 'running';
      return Promise.resolve();
    }
    close = async () => {
      closed++;
    };
    createMediaStreamSource() {
      return {
        connect() {},
        disconnect() {
          detached++;
        }
      };
    }
    createAnalyser() {
      return {
        fftSize: 256,
        smoothingTimeConstant: 0,
        getFloatTimeDomainData(samples: Float32Array) {
          samples.fill(0.1);
        },
        connect() {},
        disconnect() {
          detached++;
        }
      };
    }
    createGain() {
      const sink = {
        gain: { value: 1 },
        connect() {},
        disconnect() {
          detached++;
        }
      };
      sinks.push(sink);
      return sink;
    }
  }
  const host: any = {
    AudioContext: Context,
    MediaStream: class {
      constructor(tracks: unknown[]) {
        streams.push(tracks);
      }
    },
    performance: { now: () => now },
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++id, callback);
      return id;
    },
    cancelAnimationFrame: (key: number) => frames.delete(key),
    addEventListener: (name: string, callback: EventListener) =>
      events.set(name, callback),
    removeEventListener: (name: string) => events.delete(name),
    document: {
      addEventListener: (name: string, callback: EventListener) =>
        events.set(name, callback),
      removeEventListener: (name: string) => events.delete(name)
    }
  };
  const meter = createDesktopMicrophoneMeter({
    renderWindow: host,
    enabled,
    getTrack: () => track
  });
  return {
    meter,
    enabled,
    frames,
    streams,
    sinks,
    get context() {
      return context;
    },
    events,
    get resumeCalls() {
      return resumeCalls;
    },
    get closed() {
      return closed;
    },
    get detached() {
      return detached;
    },
    replaceTrack(value: any) {
      track = value;
    },
    frame() {
      now += 16;
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(callback => callback(now));
    },
    gesture(name = 'pointerdown') {
      events.get(name)?.(new Event(name));
    }
  };
}

test('первое включение сразу измеряет тот же track без второго захвата и слышимого вывода', () => {
  const f = fixture();
  expect(f.frames.size).toBe(0);
  f.enabled.value = true;
  expect(f.meter.ready.value).toBe(true);
  expect(f.meter.audioLevel.value).toBeCloseTo(0.1);
  expect(f.meter.speaking.value).toBe(true);
  expect(f.streams).toHaveLength(1);
  expect(f.sinks[0].gain.value).toBe(0);
  f.enabled.value = false;
  expect(f.meter.ready.value).toBe(false);
  expect(f.frames.size).toBe(0);
  expect(f.meter.audioLevel.value).toBe(0);
  expect(f.meter.speaking.value).toBe(false);
  f.meter.dispose();
  f.meter.dispose();
  expect(f.closed).toBe(1);
  expect(f.events.size).toBe(0);
});

test('WebKit interrupted возобновляется с первого жеста, включая старый pending resume', () => {
  const f = fixture('suspended', true);
  f.enabled.value = true;
  expect(f.resumeCalls).toBe(1);
  expect(f.meter.ready.value).toBe(false);
  expect(f.meter.audioLevel.value).toBe(0);
  f.context.state = 'interrupted';
  f.gesture();
  expect(f.resumeCalls).toBe(2);
  f.frame();
  expect(f.meter.ready.value).toBe(true);
  expect(f.meter.audioLevel.value).toBeCloseTo(0.1);
  f.meter.dispose();
});

test('позднее появление и замена track не требуют второго клика', () => {
  const f = fixture();
  f.replaceTrack(null);
  f.enabled.value = true;
  expect(f.meter.audioLevel.value).toBe(0);
  f.replaceTrack({ readyState: 'live', enabled: true });
  f.frame();
  expect(f.meter.audioLevel.value).toBeCloseTo(0.1);
  f.replaceTrack({ readyState: 'live', enabled: true });
  f.frame();
  expect(f.streams).toHaveLength(2);
  expect(f.detached).toBe(3);
  f.replaceTrack({ readyState: 'ended', enabled: true });
  f.frame();
  expect(f.meter.audioLevel.value).toBe(0);
  f.meter.dispose();
});

test('click повторяет разблокировку после pointerdown с незавершённым resume', () => {
  const f = fixture('suspended', true);
  f.gesture();
  expect(f.resumeCalls).toBe(1);
  f.enabled.value = true;
  expect(f.meter.ready.value).toBe(false);
  f.gesture('click');
  expect(f.resumeCalls).toBe(2);
  f.frame();
  expect(f.meter.ready.value).toBe(true);
  expect(f.meter.audioLevel.value).toBeCloseTo(0.1);
  f.meter.dispose();
});

test('возврат фокуса будит прерванный анализатор, dispose убирает callbacks', () => {
  const f = fixture();
  f.enabled.value = true;
  f.context.state = 'interrupted';
  f.events.get('focus')?.(new Event('focus'));
  expect(f.resumeCalls).toBe(1);
  f.frame();
  expect(f.meter.audioLevel.value).toBeCloseTo(0.1);
  f.meter.dispose();
  expect(f.frames.size).toBe(0);
  expect(f.events.size).toBe(0);
});

test('WebKit running с NaN-часами пересоздаётся без перезапуска RTC-track', () => {
  const f = fixture();
  f.enabled.value = true;
  const broken = f.context;
  broken.currentTime = NaN;
  f.gesture('click');
  f.frame();
  expect(f.context).not.toBe(broken);
  expect(f.closed).toBe(1);
  expect(f.meter.ready.value).toBe(true);
  expect(f.meter.audioLevel.value).toBeCloseTo(0.1);
  expect(f.streams).toHaveLength(2);
  f.meter.dispose();
});
