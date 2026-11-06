let activeOperations = 0;

export const hasActiveWebUpdateOperations = (): boolean => activeOperations > 0;

export const deferWebUpdateReload = (): (() => void) => {
  activeOperations += 1;
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    activeOperations -= 1;
  };
};
