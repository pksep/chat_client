<template>
  <Avatar
    v-bind="$attrs"
    :url="resolvedUrl"
    :alt="props.alt"
    :initials="props.initials"
    :caption="props.caption"
    :is-online="props.isOnline"
    :is-icon="props.isIcon"
  />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Avatar } from '@pksep/yui';
import { getConfig } from '../../services/useConfig';
import {
  ensureMediaObjectUrl,
  getCachedMediaObjectUrl,
  prefetchMediaObjectUrl
} from '../../services/useMediaBlobCache';

const props = withDefaults(
  defineProps<{
    path?: string | null;
    alt?: string;
    initials?: string;
    caption?: string;
    isOnline?: boolean;
    isIcon?: boolean;
  }>(),
  {
    path: '',
    alt: '',
    initials: '',
    caption: '',
    isOnline: false,
    isIcon: false
  }
);

const config = getConfig();
const resolvedUrl = ref('');
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

watch(
  () => props.path,
  path => {
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
</script>
