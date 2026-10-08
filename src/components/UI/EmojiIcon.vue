<template>
  <span
    v-if="emoji"
    class="emoji-glyph emoji-icon"
    :class="{
      'emoji-glyph--fallback': isFallback,
      'emoji-icon--loading': !isLoaded && !previewLoaded
    }"
    :data-emoji-loaded="String(isLoaded)"
    :data-emoji-animated="isAnimatedSource"
    :title="isAnimatedSource ? NOTO_EMOJI_ANIMATION_ATTRIBUTION : undefined"
    aria-hidden="true"
  >
    <span class="emoji-glyph__text">{{ emoji }}</span>
    <img
      v-if="previewSource && !isLoaded"
      class="emoji-glyph__image emoji-icon__preview"
      :class="{ 'emoji-icon__preview--loaded': previewLoaded }"
      :src="previewSource"
      alt=""
      decoding="sync"
      draggable="false"
      @load="handlePreviewLoad"
    />
    <img
      v-if="currentSource"
      :key="currentSource"
      class="emoji-glyph__image"
      :src="currentSource"
      alt=""
      decoding="sync"
      loading="eager"
      fetchpriority="high"
      draggable="false"
      @load="handleLoad"
      @error="handleError"
    />
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  getNotoEmojiAnimationDuration,
  getNotoEmojiAssetCandidates,
  hasFailedNotoEmojiAsset,
  hasLoadedNotoEmojiAsset,
  markNotoEmojiAssetFailed,
  markNotoEmojiAssetLoaded,
  NOTO_EMOJI_ANIMATION_ATTRIBUTION
} from '../../composables/useEmojiStyle';

const props = withDefaults(
  defineProps<{
    emoji: string;
    animated?: boolean;
    playOnce?: boolean;
    animationKey?: string;
  }>(),
  {
    animated: false,
    playOnce: false,
    animationKey: undefined
  }
);

const currentIndex = ref(0);
const isLoaded = ref(false);
const isFallback = ref(false);
const previewLoaded = ref(false);
const hasFinishedOneShotPlayback = ref(false);
let stopAnimationTimeout: ReturnType<typeof setTimeout> | null = null;
let playbackRequestId = 0;

const clearOneShotPlayback = (): void => {
  playbackRequestId += 1;

  if (stopAnimationTimeout) {
    clearTimeout(stopAnimationTimeout);
    stopAnimationTimeout = null;
  }
};

const usesAnimatedSource = computed(
  () => props.animated && (!props.playOnce || !hasFinishedOneShotPlayback.value)
);

const candidateSources = computed(() =>
  props.emoji
    ? getNotoEmojiAssetCandidates(props.emoji, {
        animated: usesAnimatedSource.value
      })
    : []
);

const currentSource = computed(
  () => candidateSources.value[currentIndex.value] || ''
);

const isAnimatedSource = computed(() =>
  currentSource.value.endsWith('/512.webp')
);
const previewSource = computed(() =>
  isAnimatedSource.value
    ? getNotoEmojiAssetCandidates(props.emoji)[0] || ''
    : ''
);

const resetState = (): void => {
  clearOneShotPlayback();
  currentIndex.value = 0;
  hasFinishedOneShotPlayback.value = false;
  isLoaded.value =
    hasLoadedNotoEmojiAsset(candidateSources.value[0] || '') ||
    hasFailedNotoEmojiAsset(candidateSources.value[0] || '');
  isFallback.value = candidateSources.value.length === 0;
  previewLoaded.value = hasLoadedNotoEmojiAsset(previewSource.value);
};

const handlePreviewLoad = (): void => {
  markNotoEmojiAssetLoaded(previewSource.value);
  previewLoaded.value = true;
};

const handleLoad = (): void => {
  markNotoEmojiAssetLoaded(currentSource.value);
  isLoaded.value = true;

  if (!props.playOnce || !isAnimatedSource.value) {
    return;
  }

  const source = currentSource.value;
  const requestId = ++playbackRequestId;

  void getNotoEmojiAnimationDuration(source).then(durationMs => {
    if (
      requestId !== playbackRequestId ||
      currentSource.value !== source ||
      !isAnimatedSource.value
    ) {
      return;
    }

    stopAnimationTimeout = setTimeout(() => {
      if (requestId === playbackRequestId && currentSource.value === source) {
        hasFinishedOneShotPlayback.value = true;
      }
    }, durationMs);
  });
};

const handleError = (): void => {
  markNotoEmojiAssetFailed(currentSource.value);

  if (currentIndex.value + 1 < candidateSources.value.length) {
    currentIndex.value += 1;
    isLoaded.value =
      hasLoadedNotoEmojiAsset(
        candidateSources.value[currentIndex.value] || ''
      ) ||
      hasFailedNotoEmojiAsset(candidateSources.value[currentIndex.value] || '');
    return;
  }

  isFallback.value = true;
  isLoaded.value = true;
};

watch(
  [
    () => props.emoji,
    () => props.animated,
    () => props.playOnce,
    () => props.animationKey
  ],
  resetState,
  { immediate: true }
);

watch(currentSource, source => {
  if (
    source &&
    (hasLoadedNotoEmojiAsset(source) || hasFailedNotoEmojiAsset(source))
  ) {
    isLoaded.value = true;
  }
});

onBeforeUnmount(clearOneShotPlayback);
</script>

<style scoped>
.emoji-icon--loading .emoji-glyph__text,
.emoji-icon__preview--loaded {
  opacity: 1;
}
</style>
