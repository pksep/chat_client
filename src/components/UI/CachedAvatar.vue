<template>
  <Avatar
    ref="avatarRef"
    v-bind="$attrs"
    :url="shouldResolveAvatar ? resolvedUrl : ''"
    :alt="props.alt"
    :initials="props.initials"
    :caption="props.caption"
    :is-online="props.isOnline"
    :is-icon="props.isIcon"
  />
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Avatar } from '@pksep/yui';
import { getConfig } from '../../services/useConfig';
import {
  ensureMediaObjectUrl,
  getCachedMediaObjectUrl,
  prefetchMediaObjectUrl
} from '../../services/useMediaBlobCache';
import { observeViewportVisibility } from '../../services/useSharedViewportObserver';

const props = withDefaults(
  defineProps<{
    path?: string | null;
    alt?: string;
    initials?: string;
    caption?: string;
    isOnline?: boolean;
    isIcon?: boolean;
    deferOffscreen?: boolean;
  }>(),
  {
    path: '',
    alt: '',
    initials: '',
    caption: '',
    isOnline: false,
    isIcon: false,
    deferOffscreen: false
  }
);

const config = getConfig();
const resolvedUrl = ref('');
const shouldResolveAvatar = ref(!props.deferOffscreen);
const avatarRef = ref<{ $el?: Element } | null>(null);
let stopObservingVisibility: (() => void) | null = null;
const AVATAR_LOAD_ROOT_MARGIN_PX = 1800;
const EMPTY_AVATAR_SRC =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

const isAbsoluteOrLocalUrl = (path?: string | null): boolean =>
  !!path && /^(blob:|data:|https?:\/\/|file:\/\/|\/)/i.test(path);

const buildFallbackUrl = (path?: string | null): string => {
  if (!path) {
    return '';
  }

  if (isAbsoluteOrLocalUrl(path)) {
    return path;
  }

  return `${config.CHAT_PATH_TO_FILE_CDN}/${path}`;
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

watch(
  [() => props.path, shouldResolveAvatar],
  ([path, shouldResolve]) => {
    if (!shouldResolve) {
      resolvedUrl.value = '';
      return;
    }

    if (!path || isAbsoluteOrLocalUrl(path)) {
      resolvedUrl.value = buildFallbackUrl(path);
      return;
    }

    const cachedObjectUrl = getCachedMediaObjectUrl(path);

    if (cachedObjectUrl) {
      resolvedUrl.value = cachedObjectUrl;
      return;
    }

    resolvedUrl.value = EMPTY_AVATAR_SRC;
    prefetchMediaObjectUrl(path);
    void ensureMediaObjectUrl(path).then(objectUrl => {
      if (props.path !== path) {
        return;
      }

      resolvedUrl.value = objectUrl || buildFallbackUrl(path);
    });
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
});

onBeforeUnmount(() => {
  stopObservingVisibility?.();
  stopObservingVisibility = null;
});
</script>
