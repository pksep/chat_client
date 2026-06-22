import { ref, onMounted, onUnmounted, type Ref } from 'vue';
import { useBackButton } from '../../../composables/useBackButton';
import {
  navigateToAssistant,
  navigateToDialogsList,
  navigateToGroupsList,
  RouteTypes
} from '../../../composables/navigation/useUrlRouting';
import {
  clearSelectedMessages,
  isMessageSelectionModeForTopic
} from '../../../composables/useSelectedMessages';

export function useMessageSwipe(route: Ref<{ id: string; type: string }>) {
  const touchStartX = ref(0);
  const touchStartY = ref(0);

  const SWIPE_MIN = 100;
  const VERTICAL_LIMIT = 30;

  const { addHandler, removeHandler } = useBackButton();

  const navigateBack = () => {
    if (isMessageSelectionModeForTopic(route.value.id)) {
      clearSelectedMessages();
      return;
    }

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

  onMounted(() => {
    addHandler(navigateBack);
  });

  onUnmounted(() => {
    removeHandler(navigateBack);
  });

  return {
    onTouchStart,
    onTouchEnd
  };
}
