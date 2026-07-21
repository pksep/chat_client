import { nextTick, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';

interface UseReferenceWidthOptions {
  freezeAfterFirstMeasure?: boolean;
  enabled?: Readonly<Ref<boolean>>;
}

export const useReferenceWidth = (
  elementRef: Ref<HTMLElement | null>,
  options: UseReferenceWidthOptions = {}
) => {
  const referenceWidth = ref<number | null>(null);
  let resizeObserver: ResizeObserver | null = null;
  let isFrozen = false;
  const isMeasurementEnabled = (): boolean => options.enabled?.value !== false;

  const disconnectResizeObserver = () => {
    resizeObserver?.disconnect();
    resizeObserver = null;
  };

  const updateReferenceWidth = () => {
    if (options.freezeAfterFirstMeasure && isFrozen) {
      return;
    }

    const element = elementRef.value;

    if (!element) {
      referenceWidth.value = null;
      return;
    }

    const styles = window.getComputedStyle(element);
    const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(styles.paddingRight) || 0;
    const contentWidth = element.clientWidth - paddingLeft - paddingRight;

    referenceWidth.value = contentWidth > 0 ? Math.round(contentWidth) : null;

    if (options.freezeAfterFirstMeasure && referenceWidth.value) {
      isFrozen = true;
      disconnectResizeObserver();
    }
  };

  const observeElement = async () => {
    disconnectResizeObserver();
    isFrozen = false;

    if (!isMeasurementEnabled()) {
      referenceWidth.value = null;
      return;
    }

    await nextTick();

    if (!isMeasurementEnabled()) {
      referenceWidth.value = null;
      return;
    }

    updateReferenceWidth();

    if (options.freezeAfterFirstMeasure && isFrozen) {
      return;
    }

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const element = elementRef.value;

    if (!element) {
      return;
    }

    resizeObserver = new ResizeObserver(() => {
      updateReferenceWidth();
    });

    resizeObserver.observe(element);
  };

  onMounted(() => {
    void observeElement();
  });

  watch(elementRef, () => {
    void observeElement();
  });

  if (options.enabled) {
    watch(options.enabled, () => {
      void observeElement();
    });
  }

  onUnmounted(() => {
    disconnectResizeObserver();
  });

  return referenceWidth;
};
