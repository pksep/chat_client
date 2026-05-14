<template>
  <header class="chats-toolbar calls-page__panel-header" :data-testid="`${props.dataTestid}-Container`">
    <div class="chats-toolbar__headline calls-page__headline">
      <div class="calls-page__header-copy">
        <h4
          class="chats-toolbar__title calls-page__header-title"
          :data-testid="`${props.dataTestid}-Title`"
        >
          Звонки
        </h4>
      </div>
    </div>
    <Line :data-testid="`${props.dataTestid}-Line`" />
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Line from '../UI/Line.vue';

const props = withDefaults(
  defineProps<{
    totalCount?: number;
    dataTestid?: string;
  }>(),
  {
    totalCount: 0,
    dataTestid: 'CallsHeader'
  }
);

const totalCountLabel = computed(() => {
  const mod10 = props.totalCount % 10;
  const mod100 = props.totalCount % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${props.totalCount} звонок`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${props.totalCount} звонка`;
  }

  return `${props.totalCount} звонков`;
});
</script>
