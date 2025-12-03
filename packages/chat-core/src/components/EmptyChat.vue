<template>
  <div
    class="chat__nothing"
    :data-testid="`${dataTestid}-EmptyChat-Container`"
  >
    <p
      v-if="!chapter && !isMobile"
      class="chat__nothing-paragraph"
      :data-testid="`${dataTestid}-EmptyChat-SelectParagraph`"
    >
      Выберите, кому хотели бы написать
    </p>
    <p
      v-else
      class="chat__nothing-paragraph"
      :data-testid="`${dataTestid}-EmptyChat-EmptyParagraph`"
    >
      Здесь пока ничего нет...
    </p>
  </div>
</template>

<script lang="ts" setup>
import { useResizeState } from '../composables/useResizeState';
import { MAX_W_MD } from '../utils/constants';

const { state: isMobile } = useResizeState(MAX_W_MD);

const props = withDefaults(
  defineProps<{
    chapter: string | null;
    dataTestid?: string;
  }>(),
  {
    dataTestid: () => 'EmptyChat'
  }
);
</script>
