import { ref, watch, onMounted, onUnmounted } from 'vue';
import { currentRoute, parseUrl, type RouteType } from './useUrlRouting';

export const useUrlWatcher = () => {
  const topic = ref<{ id: string | null; type: RouteType | null }>({
    id: currentRoute.value.id,
    type: currentRoute.value.type
  });

  const handlePopState = (e?: PopStateEvent) => {
    e?.preventDefault();
    const parsedRoute = parseUrl();
    currentRoute.value = parsedRoute;
    topic.value = {
      id: parsedRoute.id,
      type: parsedRoute.type
    };
  };

  onMounted(() => {
    window.addEventListener('popstate', handlePopState);
  });

  onUnmounted(() => {
    topic.value = {
      id: null,
      type: null
    };
    window.removeEventListener('popstate', handlePopState);
  });

  watch(
    [() => currentRoute.value.id, () => currentRoute.value.type],
    ([newId, newType]) => {
      topic.value = {
        id: newId,
        type: newType
      };
    }
  );

  return topic;
};
