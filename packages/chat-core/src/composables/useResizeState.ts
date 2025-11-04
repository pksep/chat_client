import { ref, onMounted, onUnmounted } from 'vue';

interface UseResizeStateOptions {
  breakpoint: string | number;
  onStateChange?: (isActive: boolean) => void;
  initialState?: boolean;
}

export function useResizeState(
  breakpointOrOptions: string | number | UseResizeStateOptions,
  options?: UseResizeStateOptions
) {
  const config =
    typeof breakpointOrOptions === 'string' ||
    typeof breakpointOrOptions === 'number'
      ? { breakpoint: breakpointOrOptions, ...options }
      : breakpointOrOptions;

  const isActive = ref(config.initialState ?? false);

  let resizeHandler: (() => void) | undefined;

  let breakpointPx: number;

  const updateState = (width: number): void => {
    const newActive = width < breakpointPx;
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
    const fontSize = parseFloat(
      getComputedStyle(document.documentElement).fontSize
    );
    breakpointPx =
      typeof config.breakpoint === 'string'
        ? parseFloat(config.breakpoint) * fontSize
        : config.breakpoint;
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
