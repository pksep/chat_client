import {
  RouteTypes,
  type RouteType
} from '../composables/navigation/useUrlRouting';
import type { ChatMenuSection } from '../composables/useChatMenu';

export const resolveChatMenuSectionForRoute = (
  routeType: RouteType | undefined,
  topicId: string | null | undefined,
  isClientTopic: boolean
): ChatMenuSection | null => {
  if (routeType === RouteTypes.CALL) {
    return 'calls';
  }

  if (routeType === RouteTypes.AI || routeType === RouteTypes.ASSISTANT) {
    return 'ai';
  }

  const isChatRoute =
    routeType === RouteTypes.DIALOGS ||
    routeType === RouteTypes.GROUP ||
    routeType === RouteTypes.FAVORITES;

  if (!isChatRoute || !topicId) {
    return null;
  }

  return isClientTopic ? 'clients' : 'chats';
};
