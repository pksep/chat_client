import { computed } from 'vue';
import { currentRoute, parseUrl, type RouteType } from './useUrlRouting';

let isPopstateBound = false;

const bindPopstateListener = (): void => {
  if (isPopstateBound || typeof window === 'undefined') {
    return;
  }

  window.addEventListener('popstate', event => {
    event.preventDefault();
    currentRoute.value = parseUrl();
  });

  isPopstateBound = true;
};

export const useUrlWatcher = () => {
  bindPopstateListener();

  return computed<{ id: string | null; type: RouteType | null }>(() => ({
    id: currentRoute.value.id,
    type: currentRoute.value.type
  }));
};
