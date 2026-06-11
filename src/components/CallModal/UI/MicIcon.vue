<template>
  <svg
    width="36"
    height="36"
    viewBox="0 0 36 36"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <clipPath :id="waveClipId">
        <path
          d="M18.0013 3.33203C21.0581 3.33203 23.5362 5.75126 23.5362 8.73554V18.6495C23.4301 21.5426 20.9943 23.8563 18.0049 23.8563C14.9481 23.8563 12.47 21.437 12.47 18.4528V8.5388C12.5761 5.64566 15.0119 3.33203 18.0013 3.33203Z"
        />
      </clipPath>
    </defs>
    <path
      d="M19.5827 29.063V31.1215C19.5827 31.9742 18.8747 32.6654 18.0013 32.6654C17.1279 32.6654 16.4199 31.9742 16.4199 31.1215V29.063V28.9562C10.9093 28.2051 6.66797 23.5854 6.66797 17.9987C6.66797 17.6127 6.90517 16.8408 7.85401 16.8408C8.80285 16.8408 9.04006 17.6127 9.04006 17.9987C9.04007 22.8304 13.0521 26.7472 18.0013 26.7472C19.6215 26.7472 21.1414 26.3274 22.4528 25.5932C24.0134 24.7195 25.279 23.4006 26.0678 21.8138C26.641 20.6608 26.9625 19.3664 26.9625 17.9987C26.9625 17.6127 27.1997 16.8408 28.1486 16.8408C29.0974 16.8408 29.3346 17.6127 29.3346 17.9987C29.3346 20.0119 28.7839 21.8995 27.8214 23.5258C26.8028 25.247 25.323 26.6755 23.547 27.6502C22.3443 28.3102 21.0058 28.7622 19.5827 28.9562L19.5827 29.063Z"
      fill="currentColor"
    />
    <path
      d="M18.0013 3.33203C21.0581 3.33203 23.5362 5.75126 23.5362 8.73554V18.6495C23.4301 21.5426 20.9943 23.8563 18.0049 23.8563C14.9481 23.8563 12.47 21.437 12.47 18.4528V8.5388C12.5761 5.64566 15.0119 3.33203 18.0013 3.33203Z"
      fill="currentColor"
    />
    <path
      class="mic-icon__audio-wave"
      :clip-path="`url(#${waveClipId})`"
      :d="audioWavePath"
      fill="#27d66b"
      :opacity="audioWaveOpacity"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    audioLevel?: number;
  }>(),
  {
    audioLevel: 0
  }
);

const normalizedAudioLevel = computed(() =>
  Math.max(
    0,
    Math.min(1, Number.isFinite(props.audioLevel) ? props.audioLevel : 0)
  )
);
const audioWavePath = computed(() => {
  const level = normalizedAudioLevel.value;
  const top = 23.6 - level * 18;
  const amplitude = 0.7 + level * 1.8;
  const firstPeak = top - amplitude;
  const firstDip = top + amplitude;
  const secondPeak = top - amplitude * 0.9;
  const secondDip = top + amplitude * 0.9;
  const firstCurve = [
    'C 12.4',
    firstPeak.toFixed(2),
    '14.8',
    firstDip.toFixed(2),
    '17.2',
    top.toFixed(2)
  ].join(' ');
  const secondCurve = [
    'C 19.7',
    secondPeak.toFixed(2),
    '22',
    secondDip.toFixed(2),
    '26',
    top.toFixed(2)
  ].join(' ');

  return [
    `M 10 ${top.toFixed(2)}`,
    firstCurve,
    secondCurve,
    'V 26 H 10 Z'
  ].join(' ');
});
const audioWaveOpacity = computed(() =>
  normalizedAudioLevel.value > 0.02 ? 1 : 0
);
const waveClipId = `mic-icon-wave-${Math.random().toString(36).slice(2)}`;
</script>

<style scoped>
.mic-icon__audio-wave {
  transition:
    d 120ms ease-out,
    opacity 120ms ease-out;
}
</style>
