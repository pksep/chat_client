<template>
  <button
    type="button"
    class="message__reply-button"
    :data-testid="`${props.dataTestid}-MessageBubble-QuickReplyButton`"
    @click.stop="$emit('reply')"
  >
    Ответить
  </button>
</template>

<script setup lang="ts">
const props = defineProps<{ dataTestid: string }>();

defineEmits(['reply']);
</script>
