<template>
  <header
    class="chats-toolbar calls-page__panel-header"
    :data-testid="`${props.dataTestid}-Container`"
  >
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
</script>
