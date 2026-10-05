<template>
  <component
    :is="props.as"
    :class="{
      'menu-section-heading': props.shared,
      'menu-section-heading--centered': props.centered
    }"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    as?: 'header' | 'div' | 'h4';
    shared?: boolean;
    centered?: boolean;
  }>(),
  { as: 'header', shared: true, centered: false }
);
</script>
