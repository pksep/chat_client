<template>
  <Search
    class="menu-section-search"
    height="var(--menu-section-search-height, 42px)"
    :model-value="props.modelValue"
    :placeholder="props.placeholder"
    :data-testid="props.dataTestid"
    @update:model-value="value => emit('update:modelValue', value)"
  />
</template>

<script setup lang="ts">
import { Search } from '@pksep/yui';

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
    dataTestid?: string;
  }>(),
  { modelValue: '', placeholder: 'Поиск', dataTestid: 'Search' }
);
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
</script>
