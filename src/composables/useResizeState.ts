import { ref, onMounted, onUnmounted } from 'vue';

let viewportWidth: number | undefined;
const resizeSubscribers = new Set<(width: number) => void>();
const readViewportWidth = (): number => (viewportWidth ??= window.innerWidth);
const broadcastResize = (): void => {
  viewportWidth = window.innerWidth;
  resizeSubscribers.forEach(update => update(viewportWidth!));
};
const subscribeResize = (update: (width: number) => void): (() => void) => {
  if (!resizeSubscribers.size) {
    viewportWidth = window.innerWidth;
    window.addEventListener('resize', broadcastResize);
  }
  resizeSubscribers.add(update);
  return () => {
    resizeSubscribers.delete(update);
    if (!resizeSubscribers.size) {
      window.removeEventListener('resize', broadcastResize);
      viewportWidth = undefined;
    }
  };
};

interface UseResizeStateOptions {
  breakpoint: string | number;
  inclusive?: boolean;
  onStateChange?: (isActive: boolean) => void;
  initialState?: boolean;
  storageKey?: string;
}

const matchesBreakpoint = (
  width: number,
  breakpointPx: number,
  inclusive = true
): boolean => (inclusive ? width <= breakpointPx : width < breakpointPx);

const parseBreakpoint = (breakpoint: string | number): number => {
  if (typeof breakpoint === 'string') {
    const value = parseFloat(breakpoint);
    if (breakpoint.endsWith('px')) {
      return value;
    }
    const fontSize = parseFloat(
      getComputedStyle(document.documentElement).fontSize
    );
    return value * fontSize;
  }
  return breakpoint;
};

const getStoredState = (storageKey?: string): boolean => {
  if (!storageKey) return false;
  const stored = sessionStorage.getItem(storageKey);
  return stored ? JSON.parse(stored) : false;
};

const getInitialState = (
  config: UseResizeStateOptions,
  windowWidth: number
): { initialActive: boolean; initialIsMobile: boolean } => {
  const breakpointPx = parseBreakpoint(config.breakpoint);
  const initialIsMobile = matchesBreakpoint(
    windowWidth,
    breakpointPx,
    config.inclusive
  );

  let initialActive: boolean;
  if (config.storageKey) {
    if (initialIsMobile) {
      initialActive = true;
    } else {
      initialActive = getStoredState(config.storageKey);
    }
  } else {
    initialActive = config.initialState ?? initialIsMobile;
  }

  return { initialActive, initialIsMobile };
};

const getInitialActiveState = (config: UseResizeStateOptions): boolean => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return config.initialState ?? false;
  }

  try {
    return getInitialState(config, readViewportWidth()).initialActive;
  } catch {
    return config.initialState ?? false;
  }
};

const getNewState = (
  config: UseResizeStateOptions,
  isMobile: boolean,
  previousIsMobile?: boolean
): { newActive?: boolean; updatedPreviousIsMobile?: boolean } => {
  let newActive: boolean | undefined;
  let updatedPreviousIsMobile = previousIsMobile;

  if (config.storageKey) {
    if (isMobile !== previousIsMobile) {
      if (isMobile) {
        newActive = true;
      } else {
        newActive = getStoredState(config.storageKey);
      }
      updatedPreviousIsMobile = isMobile;
    }
  } else {
    newActive = isMobile;
  }

  return { newActive, updatedPreviousIsMobile };
};

export function useResizeState(
  breakpointOrOptions: string | number | UseResizeStateOptions,
  options?: Omit<UseResizeStateOptions, 'breakpoint'>
) {
  const config =
    typeof breakpointOrOptions === 'string' ||
    typeof breakpointOrOptions === 'number'
      ? { breakpoint: breakpointOrOptions, ...options }
      : breakpointOrOptions;

  const isActive = ref(getInitialActiveState(config));

  let unsubscribeResize: (() => void) | undefined;
  let breakpointPx: number;
  let previousIsMobile: boolean | undefined;

  const updateState = (width: number): void => {
    const isMobile = matchesBreakpoint(width, breakpointPx, config.inclusive);

    const { newActive, updatedPreviousIsMobile } = getNewState(
      config,
      isMobile,
      previousIsMobile
    );

    previousIsMobile = updatedPreviousIsMobile;

    if (newActive !== undefined && isActive.value !== newActive) {
      isActive.value = newActive;
      config.onStateChange?.(newActive);
    }
  };

  const saveStateToStorage = (): void => {
    if (config.storageKey && breakpointPx !== undefined) {
      const currentWidth = readViewportWidth();
      const currentIsMobile = matchesBreakpoint(
        currentWidth,
        breakpointPx,
        config.inclusive
      );
      if (!currentIsMobile) {
        sessionStorage.setItem(
          config.storageKey,
          JSON.stringify(isActive.value)
        );
      }
    }
  };

  const toggle = (): void => {
    isActive.value = !isActive.value;
    config.onStateChange?.(isActive.value);
    saveStateToStorage();
  };

  const setState = (value: boolean): void => {
    if (isActive.value !== value) {
      isActive.value = value;
      config.onStateChange?.(value);
    }
    saveStateToStorage();
  };

  onMounted(() => {
    breakpointPx = parseBreakpoint(config.breakpoint);
    unsubscribeResize = subscribeResize(updateState);

    const { initialActive, initialIsMobile } = getInitialState(
      config,
      readViewportWidth()
    );

    isActive.value = initialActive;
    previousIsMobile = initialIsMobile;

    updateState(readViewportWidth());
  });

  onUnmounted(() => {
    unsubscribeResize?.();
  });

  return {
    state: isActive,
    toggle,
    setState
  };
}
