/**
 * A composable function that creates sticky headings using Intersection Observer
 * for elements with top-element class, excluding system messages
 */

interface StickyHeadingOptions {
  selector?: string;
  root?: Element | null;
  rootMargin?: string;
  threshold?: number;
}

export function useStickyHeading(options: StickyHeadingOptions = {}) {
  const {
    selector = '.top-element[data-divider]:not(.system-message)',
    root = null,
    rootMargin = '-1px 0px 0px 0px',
    threshold = 0
  } = options;

  let observer: IntersectionObserver | null = null;
  let elements: Element[] = [];

  /**
   * Creates a spacer element to prevent content jump when element becomes sticky
   */
  const createSpacer = (element: Element): HTMLDivElement => {
    const spacer = document.createElement('div');
    const elementHeight = element.offsetHeight || element.getBoundingClientRect().height;
    spacer.style.height = `${elementHeight}px`;
    spacer.style.display = 'none';
    spacer.classList.add('sticky-heading-spacer');
    element.parentNode?.insertBefore(spacer, element);
    return spacer;
  };

  /**
   * Checks if an element has a date divider inside it
   */
  const hasDateDivider = (element: Element): boolean => {
    return !!element.querySelector('.date-divider');
  };

  /**
   * Initialize the sticky heading functionality
   */
  const init = (customSelector?: string) => {
    const targetSelector = customSelector || selector;
    elements = Array.from(document.querySelectorAll(targetSelector));

    if (elements.length === 0) {
      console.info('No elements matching selector found (excluding system messages)');
      return;
    }

    // Create a spacer element for each heading to prevent content jump
    elements.forEach(element => {
      // Only process elements that have a date divider inside them
      if (!hasDateDivider(element)) {
        return;
      }

      createSpacer(element);

      // Add a class to identify the element as managed by this composable
      element.classList.add('tracked-sticky-element');
    });

    // Setup Intersection Observer
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          const element = entry.target;
          const spacer = element.previousElementSibling as HTMLElement;

          // Ensure the spacer exists, create it if it doesn't
          if (!(spacer && spacer.classList.contains('sticky-heading-spacer'))) {
            createSpacer(element);
            return;
          }

          // Determine if the element should be sticky based on its position
          const shouldStick = !entry.isIntersecting && entry.boundingClientRect.top <= 0;

          // Toggle sticky class and spacer visibility
          element.classList.toggle('sticky', shouldStick);
          spacer.style.display = shouldStick ? 'block' : 'none';
        });
      },
      {
        root,
        rootMargin,
        threshold: [threshold, 1]
      }
    );

    // Observe all elements
    elements.forEach(element => {
      observer!.observe(element);
    });
  };

  /**
   * Destroy the observer and cleanup
   */
  const destroy = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    // Remove added classes and spacers
    elements.forEach(element => {
      element.classList.remove('tracked-sticky-element');
      const spacer = element.previousElementSibling as HTMLElement;
      if (spacer?.classList.contains('sticky-heading-spacer')) {
        spacer.remove();
      }
    });

    elements = [];
  };

  /**
   * Update the observer when elements change
   */
  const update = (customSelector?: string) => {
    destroy();
    init(customSelector);
  };

  return {
    init,
    destroy,
    update
  };
}