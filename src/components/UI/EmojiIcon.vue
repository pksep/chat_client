<template>
  <span
    v-if="emoji"
    class="emoji-glyph emoji-icon"
    :class="{ 'emoji-glyph--fallback': isFallback }"
    :data-emoji-loaded="String(isLoaded)"
    aria-hidden="true"
  >
    <span class="emoji-glyph__text">{{ emoji }}</span>
    <img
      v-if="currentSource"
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
import { computed, ref, watch } from 'vue';
import {
  getNotoEmojiAssetCandidates,
  hasFailedNotoEmojiAsset,
  hasLoadedNotoEmojiAsset,
  markNotoEmojiAssetFailed,
  markNotoEmojiAssetLoaded
} from '../../composables/useEmojiStyle';

const props = withDefaults(
  defineProps<{
    emoji: string;
    animated?: boolean;
  }>(),
  {
    animated: false
  }
);

const currentIndex = ref(0);
const isLoaded = ref(false);
const isFallback = ref(false);

const candidateSources = computed(() =>
  props.emoji
    ? getNotoEmojiAssetCandidates(props.emoji, {
        animated: props.animated
      })
    : []
);

const currentSource = computed(
  () => candidateSources.value[currentIndex.value] || ''
);

const resetState = (): void => {
  currentIndex.value = 0;
  isLoaded.value =
    hasLoadedNotoEmojiAsset(candidateSources.value[0] || '') ||
    hasFailedNotoEmojiAsset(candidateSources.value[0] || '');
  isFallback.value = candidateSources.value.length === 0;
};

const handleLoad = (): void => {
  markNotoEmojiAssetLoaded(currentSource.value);
  isLoaded.value = true;
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

watch([() => props.emoji, () => props.animated], resetState, {
  immediate: true
});

watch(currentSource, source => {
  if (
    source &&
    (hasLoadedNotoEmojiAsset(source) || hasFailedNotoEmojiAsset(source))
  ) {
    isLoaded.value = true;
  }
});
</script>
