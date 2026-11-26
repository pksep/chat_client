<template>
  <div
    v-for="operation in state.operations.filter(item => item.error)"
    :key="operation.command.commandId"
    role="status"
    class="pin-note-notice"
    :data-testid="`PinCommentNotice-${operation.command.commandId}`"
  >
    <span>{{ operation.error }}</span>
    <button
      v-if="operation.status === 'retryable'"
      :disabled="state.support === 'unavailable'"
      @click="pinComments.retry(topicId, operation.command.commandId)"
    >
      Повторить
    </button>
    <template v-else>
      <p v-if="'text' in operation.command" class="pin-note-notice__recovery">
        {{ operation.command.text }}
      </p>
      <button
        @click="pinComments.discard(topicId, operation.command.commandId)"
      >
        Закрыть ошибку
      </button>
    </template>
  </div>
</template>
<script setup lang="ts">
import { usePinComments } from '../../services/usePinComments';
const props = defineProps<{ topicId: string }>();
const { state, pinComments } = usePinComments(() => props.topicId, false);
</script>
