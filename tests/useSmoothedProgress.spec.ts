import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { effectScope, nextTick, ref, type Ref } from 'vue';
import { useSmoothedProgress } from '../src/composables/useSmoothedProgress';

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
let pendingFrame: FrameRequestCallback | null = null;

const installAnimationFrameMock = (): void => {
  globalThis.requestAnimationFrame = callback => {
    pendingFrame = callback;
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {
    pendingFrame = null;
  };
};

afterEach(() => {
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  pendingFrame = null;
});

describe('useSmoothedProgress', () => {
  it('animates to the real value without exceeding it', async () => {
    installAnimationFrameMock();

    const scope = effectScope();
    const realProgress = ref(15);
    let displayedProgress!: Readonly<Ref<number | null>>;

    scope.run(() => {
      displayedProgress = useSmoothedProgress(realProgress);
    });

    assert.equal(displayedProgress.value, 15);

    realProgress.value = 22;
    await nextTick();

    const middleFrame = pendingFrame;
    assert.ok(middleFrame);
    middleFrame(performance.now() + 180);
    assert.ok(displayedProgress.value! > 15);
    assert.ok(displayedProgress.value! < 22);

    const finalFrame = pendingFrame;
    assert.ok(finalFrame);
    finalFrame(performance.now() + 1_000);
    assert.equal(displayedProgress.value, 22);

    scope.stop();
  });

  it('resets immediately when progress restarts', async () => {
    installAnimationFrameMock();

    const scope = effectScope();
    const realProgress = ref(60);
    let displayedProgress!: Readonly<Ref<number | null>>;

    scope.run(() => {
      displayedProgress = useSmoothedProgress(realProgress);
    });

    realProgress.value = 0;
    await nextTick();

    assert.equal(displayedProgress.value, 0);
    assert.equal(pendingFrame, null);

    scope.stop();
  });
});
