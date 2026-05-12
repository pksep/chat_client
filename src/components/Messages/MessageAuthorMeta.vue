<template>
  <div
    v-if="showMeta"
    class="message__author-meta"
    :data-testid="props.dataTestid"
  >
    <h3 v-if="props.sender" class="message__article-initals">
      {{ props.sender }}
    </h3>
    <span v-if="props.senderRole" class="message__author-role">
      {{ props.senderRole }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  sender?: string;
  senderRole?: string;
  dataTestid?: string;
}

const props = defineProps<Props>();

const showMeta = computed(() => Boolean(props.sender || props.senderRole));
</script>
