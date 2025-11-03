import { ref, onMounted, onUnmounted } from 'vue';

interface UseResizeStateOptions {
  breakpoint: number;
  onStateChange?: (isActive: boolean) => void;
  initialState?: boolean;
}

export function useResizeState(
  breakpointOrOptions: number | UseResizeStateOptions,
  options?: UseResizeStateOptions
) {
  const config =
    typeof breakpointOrOptions === 'number'
      ? { breakpoint: breakpointOrOptions, ...options }
      : breakpointOrOptions;

  const isActive = ref(config.initialState ?? false);

  let resizeHandler: (() => void) | undefined;

  const updateState = (width: number): void => {
    const newActive = width < config.breakpoint;
    if (isActive.value !== newActive) {
      isActive.value = newActive;
      config.onStateChange?.(newActive);
    }
  };

  const toggle = (): void => {
    isActive.value = !isActive.value;
    config.onStateChange?.(isActive.value);
  };

  const setState = (value: boolean): void => {
    if (isActive.value !== value) {
      isActive.value = value;
      config.onStateChange?.(value);
    }
  };

  onMounted(() => {
    resizeHandler = () => updateState(window.innerWidth);
    window.addEventListener('resize', resizeHandler);
    updateState(window.innerWidth);
  });

  onUnmounted(() => {
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
    }
  });

  return {
    state: isActive,
    toggle,
    setState
  };
}
