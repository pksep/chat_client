<template>
  <div class="chat__nothing">
    <p v-if="!chapter" class="chat__nothing-paragraph">
      Выберите, кому хотели бы написать
    </p>
    <p v-else class="chat__nothing-paragraph">Здесь пока ничего нет...</p>
  </div>
</template>

<script lang="ts" setup>
defineProps<{
  chapter: string | null;
}>();
</script>
