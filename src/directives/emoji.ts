import type { ObjectDirective } from 'vue';
import {
  getNotoEmojiAssetCandidates,
  hasFailedNotoEmojiAsset,
  hasLoadedNotoEmojiAsset,
  markNotoEmojiAssetFailed,
  markNotoEmojiAssetLoaded
} from '../composables/useEmojiStyle';

const EMOJI_FONT_HOST_CLASS = 'emoji-font-host';
const EMOJI_WRAPPER_CLASS = 'emoji-glyph';
const EMOJI_TEXT_CLASS = 'emoji-glyph__text';
const EMOJI_IMAGE_CLASS = 'emoji-glyph__image';
const EMOJI_FALLBACK_CLASS = 'emoji-glyph--fallback';
const GLOBAL_EMOJI_HOST_SELECTOR = '.v3-emoji-picker';
const SKIPPED_TAGS = new Set([
  'AUDIO',
  'CANVAS',
  'IFRAME',
  'IMG',
  'INPUT',
  'NOSCRIPT',
  'OPTION',
  'SCRIPT',
  'STYLE',
  'SVG',
  'TEXTAREA',
  'VIDEO'
]);
const EMOJI_GRAPHEME_PATTERN =
  /(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u{1F1E6}-\u{1F1FF}]|[#*0-9]\uFE0F?\u20E3|[\u00A9\u00AE\u2122]\uFE0F?)/u;

type EmojiDirectiveBindingValue =
  | boolean
  | {
      animated?: boolean;
    };

type EmojiDirectiveState = {
  frameId: number | null;
  isSyncing: boolean;
  observer: MutationObserver | null;
};

type EmojiDirectiveElement = HTMLElement & {
  __emojiDirectiveState__?: EmojiDirectiveState;
};

const emojiSegmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

const splitGraphemes = (value: string): string[] => {
  if (!value) {
    return [];
  }

  if (!emojiSegmenter) {
    return Array.from(value);
  }

  return Array.from(emojiSegmenter.segment(value), item => item.segment);
};

const containsEmoji = (value: string): boolean =>
  EMOJI_GRAPHEME_PATTERN.test(value);

const shouldAnimateEmoji = (wrapper: HTMLElement): boolean =>
  wrapper.closest('[data-emoji-animated="true"]') !== null;

const applyStyleToWrapper = (wrapper: HTMLElement): void => {
  const emoji = wrapper.getAttribute('data-emoji-value') || '';
  const image = wrapper.querySelector(
    `.${EMOJI_IMAGE_CLASS}`
  ) as HTMLImageElement | null;
  const candidates = getNotoEmojiAssetCandidates(emoji, {
    animated: shouldAnimateEmoji(wrapper)
  });

  if (!emoji || !image || !candidates.length) {
    return;
  }

  const serializedCandidates = JSON.stringify(candidates);

  if (
    image.dataset.candidates === serializedCandidates &&
    image.dataset.candidateIndex === '0' &&
    image.src.endsWith(candidates[0])
  ) {
    return;
  }

  wrapper.classList.remove(EMOJI_FALLBACK_CLASS);
  wrapper.setAttribute(
    'data-emoji-loaded',
    String(
      hasLoadedNotoEmojiAsset(candidates[0] || '') ||
        hasFailedNotoEmojiAsset(candidates[0] || '')
    )
  );
  image.dataset.candidates = serializedCandidates;
  image.dataset.candidateIndex = '0';
  image.src = candidates[0];
};

const createEmojiNode = (emoji: string): HTMLElement => {
  const wrapper = document.createElement('span');
  const text = document.createElement('span');
  const image = document.createElement('img');

  wrapper.className = EMOJI_WRAPPER_CLASS;
  wrapper.setAttribute('data-emoji-value', emoji);

  text.className = EMOJI_TEXT_CLASS;
  text.textContent = emoji;

  image.className = EMOJI_IMAGE_CLASS;
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  image.decoding = 'sync';
  image.loading = 'eager';
  image.setAttribute('fetchpriority', 'high');
  image.draggable = false;
  image.addEventListener('load', () => {
    markNotoEmojiAssetLoaded(image.currentSrc || image.src);
    wrapper.setAttribute('data-emoji-loaded', 'true');
  });

  image.addEventListener('error', () => {
    const candidates = JSON.parse(image.dataset.candidates || '[]') as string[];
    const nextIndex = Number(image.dataset.candidateIndex || '0') + 1;
    const failedSource = image.currentSrc || image.src;

    markNotoEmojiAssetFailed(failedSource);

    if (candidates[nextIndex]) {
      image.dataset.candidateIndex = String(nextIndex);
      wrapper.setAttribute(
        'data-emoji-loaded',
        String(hasLoadedNotoEmojiAsset(candidates[nextIndex]))
      );
      image.src = candidates[nextIndex];
      return;
    }

    wrapper.setAttribute('data-emoji-loaded', 'true');
    wrapper.classList.add(EMOJI_FALLBACK_CLASS);
  });

  wrapper.append(text, image);
  applyStyleToWrapper(wrapper);

  return wrapper;
};

const shouldSkipTextNode = (node: Text): boolean => {
  const parentElement = node.parentElement;
  const value = node.nodeValue || '';

  if (!parentElement || !value || !containsEmoji(value)) {
    return true;
  }

  if (parentElement.closest(`.${EMOJI_WRAPPER_CLASS}, .ai-code-block`)) {
    return true;
  }

  if (
    parentElement.isContentEditable ||
    parentElement.closest('[contenteditable="true"]')
  ) {
    return true;
  }

  if (SKIPPED_TAGS.has(parentElement.tagName)) {
    return true;
  }

  return false;
};

const replaceEmojiTextNodes = (root: HTMLElement): void => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return shouldSkipTextNode(node as Text)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodesToReplace: Text[] = [];

  while (walker.nextNode()) {
    nodesToReplace.push(walker.currentNode as Text);
  }

  nodesToReplace.forEach(node => {
    const value = node.nodeValue || '';
    const fragment = document.createDocumentFragment();
    const segments = splitGraphemes(value);
    let hasEmoji = false;
    let textBuffer = '';

    segments.forEach(segment => {
      if (!containsEmoji(segment)) {
        textBuffer += segment;
        return;
      }

      hasEmoji = true;

      if (textBuffer) {
        fragment.append(textBuffer);
        textBuffer = '';
      }

      fragment.append(createEmojiNode(segment));
    });

    if (!hasEmoji) {
      return;
    }

    if (textBuffer) {
      fragment.append(textBuffer);
    }

    node.replaceWith(fragment);
  });
};

const refreshEmojiWrappers = (root: HTMLElement): void => {
  root
    .querySelectorAll<HTMLElement>(`.${EMOJI_WRAPPER_CLASS}`)
    .forEach(wrapper => {
      applyStyleToWrapper(wrapper);
    });
};

const syncEmojiTree = (root: HTMLElement): void => {
  replaceEmojiTextNodes(root);
  refreshEmojiWrappers(root);
};

const runEmojiRender = (element: EmojiDirectiveElement): void => {
  const state = getDirectiveState(element);

  state.isSyncing = true;

  try {
    syncEmojiTree(element);
  } finally {
    state.isSyncing = false;
    element.setAttribute('data-emoji-pending', 'false');
  }
};

const getDirectiveState = (
  element: EmojiDirectiveElement
): EmojiDirectiveState => {
  if (!element.__emojiDirectiveState__) {
    element.__emojiDirectiveState__ = {
      frameId: null,
      isSyncing: false,
      observer: null
    };
  }

  return element.__emojiDirectiveState__;
};

const scheduleEmojiRender = (
  element: EmojiDirectiveElement,
  options: { immediate?: boolean } = {}
): void => {
  const state = getDirectiveState(element);

  if (options.immediate) {
    if (state.frameId !== null) {
      window.cancelAnimationFrame(state.frameId);
      state.frameId = null;
    }

    runEmojiRender(element);
    return;
  }

  if (state.frameId !== null) {
    return;
  }

  state.frameId = window.requestAnimationFrame(() => {
    state.frameId = null;
    runEmojiRender(element);
  });
};

const startEmojiObserver = (element: EmojiDirectiveElement): void => {
  const state = getDirectiveState(element);

  if (state.observer || typeof MutationObserver === 'undefined') {
    return;
  }

  state.observer = new MutationObserver(() => {
    if (state.isSyncing) {
      return;
    }

    scheduleEmojiRender(element);
  });

  state.observer.observe(element, {
    characterData: true,
    childList: true,
    subtree: true
  });
};

const stopEmojiObserver = (element: EmojiDirectiveElement): void => {
  const state = element.__emojiDirectiveState__;

  if (!state) {
    return;
  }

  state.observer?.disconnect();
  state.observer = null;

  if (state.frameId !== null) {
    window.cancelAnimationFrame(state.frameId);
    state.frameId = null;
  }

  delete element.__emojiDirectiveState__;
};

const updateEmojiHostOptions = (
  element: HTMLElement,
  value?: EmojiDirectiveBindingValue
): void => {
  const animated =
    typeof value === 'object' ? Boolean(value?.animated) : Boolean(value);

  element.classList.add(EMOJI_FONT_HOST_CLASS);
  element.setAttribute('data-emoji-ready', 'true');

  if (animated) {
    element.setAttribute('data-emoji-animated', 'true');
    return;
  }

  element.removeAttribute('data-emoji-animated');
};

export const emojiDirective: ObjectDirective<HTMLElement> = {
  created(element) {
    element.setAttribute('data-emoji-pending', 'true');
  },
  beforeMount(element, binding) {
    updateEmojiHostOptions(
      element,
      binding.value as EmojiDirectiveBindingValue
    );
  },
  mounted(element, binding) {
    updateEmojiHostOptions(
      element,
      binding.value as EmojiDirectiveBindingValue
    );
    scheduleEmojiRender(element as EmojiDirectiveElement, {
      immediate: true
    });
    startEmojiObserver(element as EmojiDirectiveElement);
  },
  updated(element, binding) {
    updateEmojiHostOptions(
      element,
      binding.value as EmojiDirectiveBindingValue
    );
    element.setAttribute('data-emoji-pending', 'true');
    scheduleEmojiRender(element as EmojiDirectiveElement, {
      immediate: true
    });
  },
  unmounted(element) {
    stopEmojiObserver(element as EmojiDirectiveElement);
  }
};

const syncGlobalEmojiHosts = (root: ParentNode): void => {
  const hosts = new Set<HTMLElement>();

  if (root instanceof HTMLElement && root.matches(GLOBAL_EMOJI_HOST_SELECTOR)) {
    hosts.add(root);
  }

  if ('querySelectorAll' in root) {
    root
      .querySelectorAll<HTMLElement>(GLOBAL_EMOJI_HOST_SELECTOR)
      .forEach(host => {
        hosts.add(host);
      });
  }

  hosts.forEach(host => {
    host.classList.add(EMOJI_FONT_HOST_CLASS);
    host.setAttribute('data-emoji-pending', 'true');
    scheduleEmojiRender(host as EmojiDirectiveElement, { immediate: true });
    startEmojiObserver(host as EmojiDirectiveElement);
  });
};

export const mountGlobalEmojiObserver = (root: HTMLElement): (() => void) => {
  const observedRoots = new WeakSet<ParentNode>();
  const observers: MutationObserver[] = [];

  const getNestedShadowRoots = (container: ParentNode): ShadowRoot[] => {
    const shadowRoots: ShadowRoot[] = [];
    const elements: Element[] = [];

    if (container instanceof Element) {
      elements.push(container);
    }

    if ('querySelectorAll' in container) {
      elements.push(...Array.from(container.querySelectorAll('*')));
    }

    elements.forEach(element => {
      if (element instanceof HTMLElement && element.shadowRoot) {
        shadowRoots.push(element.shadowRoot);
      }
    });

    return shadowRoots;
  };

  const syncAndObserveRoot = (container: ParentNode): void => {
    if (observedRoots.has(container)) {
      syncGlobalEmojiHosts(container);
      getNestedShadowRoots(container).forEach(syncAndObserveRoot);
      return;
    }

    observedRoots.add(container);
    syncGlobalEmojiHosts(container);

    getNestedShadowRoots(container).forEach(syncAndObserveRoot);

    if (typeof MutationObserver === 'undefined') {
      return;
    }

    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (!(node instanceof HTMLElement)) {
            return;
          }

          syncGlobalEmojiHosts(node);
          getNestedShadowRoots(node).forEach(syncAndObserveRoot);
        });
      });
    });

    observer.observe(container, {
      childList: true,
      subtree: true
    });

    observers.push(observer);
  };

  syncAndObserveRoot(root);

  return () => {
    observers.forEach(observer => observer.disconnect());
  };
};
