<template>
  <span class="chat-icon" aria-hidden="true">
    <span
      class="chat-icon__image chat-icon__image--light"
      v-html="lightLogoMarkup"
    ></span>
    <span
      class="chat-icon__image chat-icon__image--dark"
      v-html="darkLogoMarkup"
    ></span>
  </span>
</template>

<script setup lang="ts">
import { useId } from 'vue';
import lightLogoSource from '../../../../assets/logo-light.svg?raw';
import darkLogoSource from '../../../../assets/logo-dark.svg?raw';

const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');

const namespaceSvgIds = (source: string, namespace: string) =>
  source
    .replace(/\bid="([^"]+)"/g, (_match, id: string) => {
      return `id="${namespace}-${id}"`;
    })
    .replace(/url\(#([^)]+)\)/g, (_match, id: string) => {
      return `url(#${namespace}-${id})`;
    })
    .replace(/(href|xlink:href)="#([^"]+)"/g, (_match, name, id: string) => {
      return `${name}="#${namespace}-${id}"`;
    });

const lightLogoMarkup = namespaceSvgIds(
  lightLogoSource,
  `chat-logo-${instanceId}-light`
);
const darkLogoMarkup = namespaceSvgIds(
  darkLogoSource,
  `chat-logo-${instanceId}-dark`
);
</script>

<style scoped>
.chat-icon {
  display: inline-grid;
  overflow: hidden;
  line-height: 0;
}

.chat-icon__image {
  display: block;
  grid-area: 1 / 1;
  width: 100%;
  height: 100%;
}

.chat-icon__image--dark {
  opacity: 0;
}
</style>

<style>
.chat-icon__image > svg {
  display: block;
  width: 100%;
  height: 100%;
  shape-rendering: geometricPrecision;
}

.chat-icon__image > svg * {
  shape-rendering: geometricPrecision;
}

:is([data-theme='dark'], .theme-dark) .chat-icon__image--light {
  opacity: 0;
}

:is([data-theme='dark'], .theme-dark) .chat-icon__image--dark {
  opacity: 1;
}
</style>
