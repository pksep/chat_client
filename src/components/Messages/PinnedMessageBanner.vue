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
        v-if="props.showList"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        aria-label="Список закреплённых сообщений"
        :data-testid="`${props.dataTestid}-ListButton`"
        @click.stop="emit('open-list')"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-brand)"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <path
            d="M13 21H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6M7 7h7M7 11h7M7 15h4M17 13v6m4-6v6m-5-6h6m-5 6h4l1 2h-6l1-2Z"
          />
        </svg>
      </Button>
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
    showList?: boolean;
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
  (event: 'open-list'): void;
}>();
</script>
