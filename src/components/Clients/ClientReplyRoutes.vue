<template>
  <div
    v-if="inquiry"
    class="client-reply-routes"
    data-testid="ClientReplyRoutes"
  >
    <span class="client-reply-routes__label">Ответить через</span>
    <ChatsToolbarFilters
      v-if="options.length"
      :model-value="managerRouteSelection[topicId] || ''"
      :options="options"
      data-testid="ClientReplyRoute"
      @update:model-value="managerRouteSelection[topicId] = $event"
    >
      <template #icon="{ option }"
        ><ClientPlatformIcon
          :platform="
            channelLabel(
              routes.find(route => route.id === option.value)?.channel || ''
            )
          "
      /></template>
    </ChatsToolbarFilters>
    <span v-else>Загрузка каналов…</span>
    <p v-if="selected && !selected.canReply" role="alert">
      Канал недоступен для ответа
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue';
import { useManagerInquiries } from '../../composables/useManagerInquiries';
import {
  channelLabel,
  managerRoutes,
  managerRouteSelection,
  refreshManagerRoutes,
  selectedManagerRoute
} from '../../composables/useManagerRoutes';
import ChatsToolbarFilters from '../Menu/ChatsToolbarFilters.vue';
import ClientPlatformIcon from './ClientPlatformIcon.vue';
import { showErrorNotification } from '../../composables/useNotifications';

const props = defineProps<{ topicId: string }>();
const { byTopic } = useManagerInquiries();
const inquiry = computed(() => byTopic.value.get(props.topicId));
const routes = computed(() => managerRoutes[props.topicId] || []);
const selected = computed(() => selectedManagerRoute(props.topicId));
const options = computed(() =>
  routes.value
    .filter(
      route =>
        route.canReply || route.id === managerRouteSelection[props.topicId]
    )
    .map(route => ({
      value: route.id,
      label: `${channelLabel(route.channel)}${routes.value.filter(other => other.channel === route.channel).length > 1 ? ` · ${route.title || route.name}` : ''}`
    }))
);
let timer: ReturnType<typeof setInterval> | undefined;
let generation = 0;
let busy = false;
let lastRoutesError = '';

watch(
  () => inquiry.value?.id,
  id => {
    clearInterval(timer);
    generation++;
    lastRoutesError = '';
    if (!id) return;
    const expected = generation;
    const topicId = props.topicId;
    const refresh = async (): Promise<void> => {
      if (busy || expected !== generation) return;
      busy = true;
      try {
        await refreshManagerRoutes(topicId, id);
        if (expected === generation) lastRoutesError = '';
      } catch {
        const message = 'Не удалось обновить каналы и доставку';
        if (expected === generation && lastRoutesError !== message) {
          lastRoutesError = message;
          showErrorNotification(message);
        }
      } finally {
        busy = false;
      }
    };
    void refresh();
    timer = setInterval(() => void refresh(), 4000);
  },
  { immediate: true }
);

onUnmounted(() => {
  generation++;
  clearInterval(timer);
});
</script>

<style scoped>
.client-reply-routes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-border-table, #e7e7e7);
  font-size: 12px;
}
.client-reply-routes__label {
  color: var(--text-text-secondary, #757d8a);
}
.client-reply-routes :deep(.chats-toolbar__filters) {
  flex-wrap: wrap;
}
.client-reply-routes p {
  margin: 0;
  color: var(--text-text-secondary, #757d8a);
}
</style>
