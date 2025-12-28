import { customRouter } from '../router/CustomRouter';

export interface RouteParams {
  chapter?: string;
  contactId?: string;
}

export const useUrlRouter = () => {
  const parseRouteFromUrl = (): RouteParams => {
    const route = customRouter.getCurrentRoute();
    const pathParts = route.path.split('/').filter(part => part);

    if (pathParts.length === 0) {
      return { chapter: null };
    }

    const chapter = pathParts[0];
    const contactId = pathParts.length > 1 ? pathParts[1] : undefined;

    return { chapter, contactId };
  };

  return {
    parseRouteFromUrl
  };
};
