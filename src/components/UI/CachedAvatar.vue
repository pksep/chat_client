<template>
  <Avatar
    ref="avatarRef"
    class="cached-avatar"
    v-bind="$attrs"
    :url="resolvedUrl"
    :alt="props.alt"
    :initials="props.initials"
    :caption="props.caption"
    :is-online="props.isOnline"
    :is-icon="props.isIcon"
    :class="{
      'cached-avatar--extended-initials': hasExtendedFallbackInitials,
      'cached-avatar--image-ready': isResolvedAvatarReady
    }"
    :data-cached-avatar-initials="
      hasExtendedFallbackInitials ? fallbackInitials : undefined
    "
    :style="{
      '--cached-avatar-fallback-color': fallbackBackgroundColor
    }"
  />
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'vue';
import { Avatar } from '@pksep/yui';
import {
  ensureMediaObjectUrl,
  getCachedMediaObjectUrl
} from '../../services/useMediaBlobCache';
import {
  hasVerifiedAvatarUrl,
  preloadAvatarImage
} from '../../services/avatar-image-verification';
import { observeViewportVisibility } from '../../services/useSharedViewportObserver';
import { directAvatarUrl } from '../../utils/direct-avatar-url';

const props = withDefaults(
  defineProps<{
    path?: string | null;
    alt?: string;
    initials?: string;
    caption?: string;
    isOnline?: boolean;
    isIcon?: boolean;
    deferOffscreen?: boolean;
    fallbackInitialsLength?: 1 | 2;
  }>(),
  {
    path: '',
    alt: '',
    initials: '',
    caption: '',
    isOnline: false,
    isIcon: false,
    deferOffscreen: false,
    fallbackInitialsLength: 1
  }
);

const resolvedUrl = ref('');
const isResolvedAvatarReady = ref(false);
let resolvedAvatarPath = '';
const fallbackInitials = computed(() =>
  Array.from(props.initials.trim().replace(/\s+/g, ''))
    .slice(0, props.fallbackInitialsLength)
    .join('')
    .toLocaleUpperCase('ru-RU')
);
const hasExtendedFallbackInitials = computed(
  () => props.fallbackInitialsLength > 1 && fallbackInitials.value.length > 1
);
const fallbackBackgroundColor = computed(() => {
  const colors = [
    'var(--error-color)',
    'var(--orange4)',
    'var(--green2)',
    'var(--blue24)',
    'var(--blue22)',
    'var(--blue4)',
    'var(--violet2)',
    'var(--pink-color)'
  ];
  const firstInitial = fallbackInitials.value.charAt(0);

  return colors[firstInitial.charCodeAt(0) % colors.length] || colors[0];
});
const shouldResolveAvatar = ref(!props.deferOffscreen);
const avatarRef = ref<{ $el?: Element } | null>(null);
let stopObservingVisibility: (() => void) | null = null;
let avatarRequestVersion = 0;
let isUnmounted = false;
const AVATAR_LOAD_ROOT_MARGIN_PX = 1800;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryCount = 0;
let loadingAvatar = false;
let loadVersion = 0;

const canRenderAvatarSynchronously = (url: string): boolean =>
  hasVerifiedAvatarUrl(url) || !!directAvatarUrl(url);

const resolveAvatar = async (
  path: string | null | undefined,
  shouldResolve: boolean
): Promise<void> => {
  const requestVersion = ++avatarRequestVersion;

  if (!path) {
    resolvedUrl.value = '';
    isResolvedAvatarReady.value = false;
    resolvedAvatarPath = '';
    return;
  }

  if (resolvedAvatarPath && resolvedAvatarPath !== path) {
    resolvedUrl.value = '';
    isResolvedAvatarReady.value = false;
    resolvedAvatarPath = '';
  }

  if (!shouldResolve) {
    return;
  }

  const synchronousCandidateUrl =
    directAvatarUrl(path) ||
    getCachedMediaObjectUrl(path) ||
    (hasVerifiedAvatarUrl(path) ? path : '');

  if (
    synchronousCandidateUrl &&
    canRenderAvatarSynchronously(synchronousCandidateUrl)
  ) {
    resolvedUrl.value = synchronousCandidateUrl;
    resolvedAvatarPath = path;
    isResolvedAvatarReady.value = hasVerifiedAvatarUrl(synchronousCandidateUrl);
    if (isResolvedAvatarReady.value) return;

    const isImageReady = await preloadAvatarImage(synchronousCandidateUrl);
    if (
      isUnmounted ||
      requestVersion !== avatarRequestVersion ||
      props.path !== path
    ) {
      return;
    }
    if (!isImageReady) {
      resolvedUrl.value = '';
      isResolvedAvatarReady.value = false;
      resolvedAvatarPath = '';
      return;
    }

    isResolvedAvatarReady.value = true;
    return;
  }

  // Инициалы остаются базовым состоянием до подтверждённой загрузки картинки.
  resolvedUrl.value = '';
  isResolvedAvatarReady.value = false;

  const candidateUrl =
    synchronousCandidateUrl || (await ensureMediaObjectUrl(path));

  if (
    !candidateUrl ||
    isUnmounted ||
    requestVersion !== avatarRequestVersion ||
    props.path !== path
  ) {
    return;
  }

  if (hasVerifiedAvatarUrl(candidateUrl)) {
    resolvedUrl.value = candidateUrl;
    isResolvedAvatarReady.value = true;
    return;
  }

  const isImageReady = await preloadAvatarImage(candidateUrl);
  if (
    !isImageReady ||
    isUnmounted ||
    requestVersion !== avatarRequestVersion ||
    props.path !== path
  ) {
    return;
  }

  resolvedUrl.value = candidateUrl;
  resolvedAvatarPath = path;
  isResolvedAvatarReady.value = true;
};

const syncDeferredVisibility = async (): Promise<void> => {
  stopObservingVisibility?.();
  stopObservingVisibility = null;

  if (!props.deferOffscreen) {
    shouldResolveAvatar.value = true;
    return;
  }

  await nextTick();
  const element = avatarRef.value?.$el;
  if (!(element instanceof HTMLElement)) {
    shouldResolveAvatar.value = true;
    return;
  }

  const rect = element.getBoundingClientRect();
  shouldResolveAvatar.value =
    rect.bottom >= -AVATAR_LOAD_ROOT_MARGIN_PX &&
    rect.top <= window.innerHeight + AVATAR_LOAD_ROOT_MARGIN_PX;
  stopObservingVisibility = observeViewportVisibility(
    element,
    isVisible => {
      shouldResolveAvatar.value = isVisible;
    },
    { rootMargin: `${AVATAR_LOAD_ROOT_MARGIN_PX}px 0px` }
  );
};

const retryFailedAvatar = () => {
  const element = avatarRef.value?.$el;
  if (
    isUnmounted ||
    loadingAvatar ||
    document.hidden ||
    !props.path ||
    !shouldResolveAvatar.value ||
    isResolvedAvatarReady.value ||
    !(element instanceof HTMLElement)
  )
    return;
  const rect = element.getBoundingClientRect();
  if (rect.bottom < 0 || rect.top > window.innerHeight) return;
  void loadAvatar();
};
const loadAvatar = async () => {
  clearTimeout(retryTimer);
  const version = ++loadVersion;
  loadingAvatar = true;
  try {
    await resolveAvatar(props.path, shouldResolveAvatar.value);
  } catch {
    // Временная ошибка сети не должна оставлять инициалы до перезапуска чата.
  } finally {
    if (version === loadVersion) {
      loadingAvatar = false;
      if (
        !isUnmounted &&
        props.path &&
        shouldResolveAvatar.value &&
        !isResolvedAvatarReady.value &&
        retryCount < 2
      ) {
        retryCount += 1;
        retryTimer = setTimeout(retryFailedAvatar, retryCount * 1500);
      }
    }
  }
};

watch(
  [() => props.path, shouldResolveAvatar],
  () => {
    retryCount = 0;
    void loadAvatar();
  },
  { immediate: true }
);

watch(
  () => props.deferOffscreen,
  () => {
    void syncDeferredVisibility();
  }
);

onMounted(() => {
  void syncDeferredVisibility();
  window.addEventListener('online', retryFailedAvatar);
  window.addEventListener('focus', retryFailedAvatar);
  document.addEventListener('visibilitychange', retryFailedAvatar);
});

onBeforeUnmount(() => {
  isUnmounted = true;
  clearTimeout(retryTimer);
  window.removeEventListener('online', retryFailedAvatar);
  window.removeEventListener('focus', retryFailedAvatar);
  document.removeEventListener('visibilitychange', retryFailedAvatar);
  avatarRequestVersion += 1;
  stopObservingVisibility?.();
  stopObservingVisibility = null;
});
</script>

<style>
.avatar-yui-kit.cached-avatar .avatar-yui-kit__image {
  transition: none;
}

.avatar-yui-kit.cached-avatar--image-ready .avatar-yui-kit__image {
  opacity: 1;
}

.avatar-yui-kit.cached-avatar--image-ready .avatar-yui-kit__fallback {
  display: none;
}

.avatar-yui-kit.cached-avatar--extended-initials:has(
    .avatar-yui-kit__fallback
  )::before {
  content: attr(data-cached-avatar-initials);
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background-color: var(--cached-avatar-fallback-color);
  color: var(--color, #fff);
  font-size: 1em;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  pointer-events: none;
}

.avatar-yui-kit.cached-avatar--extended-initials
  .avatar-yui-kit__fallback
  .avatar-yui-kit__text {
  visibility: hidden;
}
</style>
