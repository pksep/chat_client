import { RouteTypes, type RouteType } from './navigation/useUrlRouting';

export const isShowContactList = (
  chapter: RouteType,
  id: string | null = null
): boolean =>
  chapter === RouteTypes.ASSISTANT ||
  (chapter === RouteTypes.GROUP && id === null) ||
  (chapter === RouteTypes.DIALOGS && id === null);
