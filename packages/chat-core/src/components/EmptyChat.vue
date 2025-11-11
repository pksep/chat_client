<template>
  <div class="chat__nothing">
    <p v-if="!chapter && !isMobile" class="chat__nothing-paragraph">
      Выберите, кому хотели бы написать
    </p>
    <p v-else class="chat__nothing-paragraph">Здесь пока ничего нет...</p>
  </div>
</template>

<script lang="ts" setup>
import { useResizeState } from '../composables/useResizeState';
import { MAX_W_MD } from '../utils/constants';

const { state: isMobile } = useResizeState(MAX_W_MD);

defineProps<{
  chapter: string | null;
}>();
</script>
