import { ref, onMounted, onUnmounted, type Ref } from 'vue';
import { App as CapacitorApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import {
  navigateToAssistant,
  navigateToDialogsList,
  navigateToGroupsList,
  RouteTypes
} from '../../../composables/navigation/useUrlRouting';

export function useMessageSwipe(route: Ref<{ id: string; type: string }>) {
  const touchStartX = ref(0);
  const touchStartY = ref(0);

  const SWIPE_MIN = 100;
  const VERTICAL_LIMIT = 30;

  let backButtonListener: PluginListenerHandle | null = null;

  const navigateBack = () => {
    if (route.value.type === RouteTypes.AI) {
      navigateToAssistant();
    } else if (route.value.type === RouteTypes.DIALOGS) {
      navigateToDialogsList();
    } else if (route.value.type === RouteTypes.GROUP) {
      navigateToGroupsList();
    }
  };

  const onTouchStart = (e: TouchEvent) => {
    const t = e.changedTouches[0];
    touchStartX.value = t.clientX;
    touchStartY.value = t.clientY;
  };

  const onTouchEnd = (e: TouchEvent) => {
    const t = e.changedTouches[0];

    const deltaX = Math.abs(t.clientX - touchStartX.value);
    const deltaY = Math.abs(t.clientY - touchStartY.value);

    if (deltaX < SWIPE_MIN && deltaY < SWIPE_MIN) return;
    if (deltaY > deltaX + VERTICAL_LIMIT) return;

    navigateBack();
  };

  onMounted(async () => {
    backButtonListener = await CapacitorApp.addListener('backButton', () => {
      navigateBack();
    });
  });

  onUnmounted(() => {
    if (backButtonListener) {
      backButtonListener.remove();
    }
  });

  return {
    onTouchStart,
    onTouchEnd
  };
}
