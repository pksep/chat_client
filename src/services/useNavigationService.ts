import { customRouter } from '../router/CustomRouter';

export interface RouteParams {
  chapter?: string;
  contactId?: string;
}

export const useNavigationService = () => {
  const navigateToChapter = (chapter: string | null, contactId?: string) => {
    if (!chapter) {
      customRouter.navigate('/');
      return;
    }

    // Handle special views
    if (['ai', 'assistant', 'channels', 'dialogs'].includes(chapter)) {
      customRouter.navigate(`/${chapter}`);
      return;
    }

    // For other chapters, navigate based on contact type
    if (contactId) {
      if (chapter === 'group') {
        customRouter.navigate(`/group/${contactId}`);
      } else {
        customRouter.navigate(`/contact/${contactId}`);
      }
    } else {
      customRouter.navigate(`/${chapter}`);
    }
  };

  const getCurrentRoute = (): RouteParams => {
    const route = customRouter.getCurrentRoute();
    const pathParts = route.path.split('/').filter(part => part);

    if (pathParts.length === 0) {
      return { chapter: null };
    }

    const chapter = pathParts[0];
    const contactId = pathParts.length > 1 ? pathParts[1] : undefined;

    return { chapter, contactId };
  };

  const destroy = () => {
    // Cleanup function if needed
  };

  return {
    navigateToChapter,
    getCurrentRoute,
    destroy
  };
};
