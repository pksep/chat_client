type VisibilityCallback = (isVisible: boolean) => void;

interface SharedObserverBucket {
  observer: IntersectionObserver;
  callbacks: Map<Element, Set<VisibilityCallback>>;
}

const observerBuckets = new Map<string, SharedObserverBucket>();

const getObserverBucket = (rootMargin: string): SharedObserverBucket => {
  const existingBucket = observerBuckets.get(rootMargin);

  if (existingBucket) {
    return existingBucket;
  }

  const callbacks = new Map<Element, Set<VisibilityCallback>>();
  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        callbacks.get(entry.target)?.forEach(callback => {
          callback(entry.isIntersecting);
        });
      });
    },
    {
      root: null,
      rootMargin,
      threshold: 0.01
    }
  );
  const bucket = { observer, callbacks };

  observerBuckets.set(rootMargin, bucket);
  return bucket;
};

export const observeViewportVisibility = (
  element: Element,
  callback: VisibilityCallback,
  opts: { rootMargin: string }
): (() => void) => {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    callback(true);
    return () => undefined;
  }

  const bucket = getObserverBucket(opts.rootMargin);
  const elementCallbacks = bucket.callbacks.get(element) || new Set();
  const wasObserved = elementCallbacks.size > 0;

  elementCallbacks.add(callback);
  bucket.callbacks.set(element, elementCallbacks);

  if (!wasObserved) {
    bucket.observer.observe(element);
  }

  return () => {
    const callbacks = bucket.callbacks.get(element);

    callbacks?.delete(callback);
    if (callbacks?.size) {
      return;
    }

    bucket.callbacks.delete(element);
    bucket.observer.unobserve(element);

    if (bucket.callbacks.size === 0) {
      bucket.observer.disconnect();
      observerBuckets.delete(opts.rootMargin);
    }
  };
};
