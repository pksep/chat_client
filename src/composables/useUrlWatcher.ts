import { ref, watch, onMounted, onUnmounted } from 'vue';
import { currentRoute, parseUrl } from './useUrlRouting';

/**
 * Composable that watches for URL changes and returns the topicId
 * @returns A ref containing the current topicId
 */
export const useUrlWatcher = () => {
  const topicId = ref<string | null>(currentRoute.value.id);

  const handlePopState = () => {
    const parsedRoute = parseUrl();
    currentRoute.value = parsedRoute;
    topicId.value = parsedRoute.id;
  };

  onMounted(() => {
    window.addEventListener('popstate', handlePopState);
  });

  onUnmounted(() => {
    window.removeEventListener('popstate', handlePopState);
  });

  // Watch for programmatic changes to currentRoute as well
  watch(() => currentRoute.value.id, (newId) => {
    topicId.value = newId;
  });

  return topicId;
};