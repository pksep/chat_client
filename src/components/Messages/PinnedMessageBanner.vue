<template>
  <div
    class="pinned-messages"
    :data-testid="props.dataTestid"
    @click="emit('navigate')"
  >
    <div class="chat__input__action">
      <div class="chat__input__action__blog">
        <h5>{{ props.title }}</h5>
        <p :key="props.previewKey" v-emoji>{{ props.previewText }}</p>
      </div>
      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        :data-testid="`${props.dataTestid}-CloseButton`"
        @click.stop="emit('request-unpin')"
      >
        <Icon :name="IconNameEnum.crossLarge" color="var(--chat-secondary)" />
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';

const props = withDefaults(
  defineProps<{
    previewText: string;
    previewKey?: string;
    title?: string;
    dataTestid?: string;
  }>(),
  {
    previewKey: '',
    title: 'Закреплённое сообщение',
    dataTestid: 'Pinned-Messages'
  }
);

const emit = defineEmits<{
  (event: 'navigate'): void;
  (event: 'request-unpin'): void;
}>();
</script>
