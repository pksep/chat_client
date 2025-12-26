<template>
  <div class="chat__nothing" :data-testid="`${dataTestid}-Loading-Container`">
    <p
      class="chat__nothing-paragraph"
      :data-testid="`${dataTestid}-Loading-Paragraph`"
    >
      {{ message }}
    </p>
  </div>
</template>

<script lang="ts" setup>
withDefaults(
  defineProps<{
    message?: string;
    dataTestid?: string;
  }>(),
  {
    message: () => 'Загрузка...',
    dataTestid: () => 'Loading'
  }
);
</script>
