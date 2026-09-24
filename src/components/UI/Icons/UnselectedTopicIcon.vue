<template>
  <span class="unselected-topic-icon" aria-hidden="true">
    <img
      class="unselected-topic-icon__image unselected-topic-icon__image--light"
      :src="lightIconUrl"
      alt=""
      draggable="false"
    />
    <img
      class="unselected-topic-icon__image unselected-topic-icon__image--dark"
      :src="darkIconUrl"
      alt=""
      draggable="false"
    />
  </span>
</template>

<script setup lang="ts">
import lightIconUrl from '../../../../assets/unselected-topic-light.svg?url';
import darkIconUrl from '../../../../assets/unselected-topic-dark.svg?url';
</script>

<style scoped>
.unselected-topic-icon {
  display: inline-grid;
  flex: none;
  width: 194px;
  height: 194px;
  overflow: hidden;
  line-height: 0;
}

.unselected-topic-icon__image {
  display: block;
  grid-area: 1 / 1;
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: auto;
  user-select: none;
}

.unselected-topic-icon__image--dark {
  opacity: 0;
}
</style>

<style>
:is([data-theme='dark'], .theme-dark) .unselected-topic-icon__image--light {
  opacity: 0;
}

:is([data-theme='dark'], .theme-dark) .unselected-topic-icon__image--dark {
  opacity: 1;
}
</style>
