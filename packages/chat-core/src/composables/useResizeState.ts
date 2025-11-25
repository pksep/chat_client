import { ref, onMounted, onUnmounted } from 'vue';

interface UseResizeStateOptions {
  breakpoint: string | number;
  onStateChange?: (isActive: boolean) => void;
  initialState?: boolean;
  storageKey?: string;
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
  let previousIsMobile: boolean | undefined;

  const updateState = (width: number): void => {
    const isMobile = width < breakpointPx;
    let newActive: boolean | undefined;
    if (config.storageKey) {
      if (isMobile !== previousIsMobile) {
        if (isMobile) {
          newActive = true;
        } else {
          const stored = sessionStorage.getItem(config.storageKey);
          newActive = stored ? JSON.parse(stored) : false;
        }
        previousIsMobile = isMobile;
      }
    } else {
      newActive = isMobile;
    }
    if (newActive !== undefined && isActive.value !== newActive) {
      isActive.value = newActive;
      config.onStateChange?.(newActive);
    }
  };

  const toggle = (): void => {
    isActive.value = !isActive.value;
    config.onStateChange?.(isActive.value);
    if (config.storageKey && breakpointPx !== undefined) {
      const currentWidth = window.innerWidth;
      const currentIsMobile = currentWidth < breakpointPx;
      if (!currentIsMobile) {
        sessionStorage.setItem(
          config.storageKey,
          JSON.stringify(isActive.value)
        );
      }
    }
  };

  const setState = (value: boolean): void => {
    if (isActive.value !== value) {
      isActive.value = value;
      config.onStateChange?.(value);
    }
    if (config.storageKey && breakpointPx !== undefined) {
      const currentWidth = window.innerWidth;
      const currentIsMobile = currentWidth < breakpointPx;
      if (!currentIsMobile) {
        sessionStorage.setItem(
          config.storageKey,
          JSON.stringify(isActive.value)
        );
      }
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
    const initialWidth = window.innerWidth;
    const initialIsMobile = initialWidth < breakpointPx;
    if (config.storageKey) {
      let initialActive: boolean;
      if (initialIsMobile) {
        initialActive = true;
      } else {
        const stored = sessionStorage.getItem(config.storageKey);
        initialActive = stored ? JSON.parse(stored) : false;
      }
      isActive.value = initialActive;
      previousIsMobile = initialIsMobile;
    }
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
