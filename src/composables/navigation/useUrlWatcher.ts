import { ref, watch, onMounted, onUnmounted } from 'vue';
import { currentRoute, parseUrl, type RouteType } from './useUrlRouting';

/**
 * Composable that watches for URL changes and returns the topic object
 * @returns A ref containing the current topic object with id and type
 */
export const useUrlWatcher = () => {
  const topic = ref<{ id: string | null; type: RouteType | null }>({
    id: currentRoute.value.id,
    type: currentRoute.value.type
  });

  const handlePopState = () => {
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
