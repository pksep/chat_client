<template>
  <div
    class="chats-toolbar__filters"
    :data-testid="`${props.dataTestid}-Filters`"
  >
    <button
      v-for="option in props.options"
      :key="option.value"
      type="button"
      :class="[
        'chats-toolbar__filter-button',
        {
          'chats-toolbar__filter-button--active':
            props.modelValue === option.value
        }
      ]"
      :aria-pressed="props.modelValue === option.value"
      :data-testid="`${props.dataTestid}-Filter-${option.value}`"
      @click="emit('update:modelValue', option.value)"
    >
      <slot name="icon" :option="option" />
      <span>{{ option.label }}</span>
      <span
        v-if="!!props.counts?.[option.value]"
        :class="[
          'chats-toolbar__filter-count',
          {
            'chats-toolbar__filter-count--muted':
              props.mutedOnly?.[option.value]
          }
        ]"
        >{{ props.counts?.[option.value] }}</span
      >
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string">
// Общая разметка и существующие стили фильтров для чатов и клиентских заявок.
const props = defineProps<{
  modelValue: T | null;
  options: Array<{ value: T; label: string }>;
  counts?: Partial<Record<T, number>>;
  mutedOnly?: Partial<Record<T, boolean>>;
  dataTestid: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: T] }>();
</script>
