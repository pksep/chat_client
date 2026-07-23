import { ref, onMounted, onUnmounted } from 'vue';

interface UseResizeStateOptions {
  breakpoint: string | number;
  onStateChange?: (isActive: boolean) => void;
  initialState?: boolean;
  storageKey?: string;
}

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
  const initialIsMobile = windowWidth < breakpointPx;

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
    return getInitialState(config, window.innerWidth).initialActive;
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
  options?: UseResizeStateOptions
) {
  const config =
    typeof breakpointOrOptions === 'string' ||
    typeof breakpointOrOptions === 'number'
      ? { breakpoint: breakpointOrOptions, ...options }
      : breakpointOrOptions;

  const isActive = ref(getInitialActiveState(config));

  let resizeHandler: (() => void) | undefined;
  let breakpointPx: number;
  let previousIsMobile: boolean | undefined;

  const updateState = (width: number): void => {
    const isMobile = width < breakpointPx;

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

    const { initialActive, initialIsMobile } = getInitialState(
      config,
      window.innerWidth
    );

    isActive.value = initialActive;
    previousIsMobile = initialIsMobile;

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
