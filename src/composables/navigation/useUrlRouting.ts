import { ref } from 'vue';

const RouteTypes = {
  DIALOGS: 'dialogs',
  GROUP: 'group',
  ASSISTANT: 'assistant',
  AI: 'ai',
  DEFAULT: 'default'
} as const;

type RouteType = (typeof RouteTypes)[keyof typeof RouteTypes];

interface Route {
  type: RouteType;
  id: string | null;
}

const currentRoute = ref<Route>({ type: RouteTypes.DEFAULT, id: null });

const parseUrl = (): Route => {
  const url = new URL(window.location.href);
  const pathParts = url.pathname.split('/').filter(part => part !== '');

  if (pathParts.length >= 2) {
    const type = pathParts[0];
    const id = pathParts[1];

    if (type === RouteTypes.DIALOGS && id) {
      return { type: RouteTypes.DIALOGS, id };
    } else if (type === RouteTypes.GROUP && id) {
      return { type: RouteTypes.GROUP, id };
    }
  } else if (pathParts.length === 1) {
    const type = pathParts[0];

    if (type === RouteTypes.DIALOGS) {
      return { type: RouteTypes.DIALOGS, id: null };
    } else if (type === RouteTypes.GROUP) {
      return { type: RouteTypes.GROUP, id: null };
    } else if (type === RouteTypes.ASSISTANT) {
      return { type: RouteTypes.ASSISTANT, id: null };
    } else if (type === RouteTypes.AI) {
      return { type: RouteTypes.AI, id: null };
    }
  }

  const dialogsId = url.searchParams.get('dialogs');
  const groupId = url.searchParams.get('group');

  if (dialogsId) {
    return { type: RouteTypes.DIALOGS, id: dialogsId };
  } else if (groupId) {
    return { type: RouteTypes.GROUP, id: groupId };
  }

  return { type: RouteTypes.DEFAULT, id: null };
};

const updateUrl = (route: Route): void => {
  let newUrl: string;

  if (route.type === RouteTypes.DIALOGS && route.id) {
    newUrl = `${window.location.origin}/dialogs/${route.id}`;
  } else if (route.type === RouteTypes.DIALOGS && !route.id) {
    newUrl = `${window.location.origin}/dialogs`;
  } else if (route.type === RouteTypes.GROUP && route.id) {
    newUrl = `${window.location.origin}/group/${route.id}`;
  } else if (route.type === RouteTypes.GROUP && !route.id) {
    newUrl = `${window.location.origin}/group`;
  } else if (route.type === RouteTypes.ASSISTANT && !route.id) {
    newUrl = `${window.location.origin}/assistant`;
  } else if (route.type === RouteTypes.AI && !route.id) {
    newUrl = `${window.location.origin}/ai`;
  } else {
    newUrl = window.location.origin;
  }

  const currentUrl = new URL(window.location.href);
  const searchParams = new URLSearchParams(currentUrl.search);

  searchParams.delete('dialogs');
  searchParams.delete('group');
  searchParams.delete('assistant');
  searchParams.delete('ai');

  if (searchParams.toString()) {
    newUrl += '?' + searchParams.toString();
  }

  window.history.replaceState({}, document.title, newUrl);
  currentRoute.value = route;
};

const navigateToDialogs = (dialogsId: string): void => {
  updateUrl({ type: RouteTypes.DIALOGS, id: dialogsId });
};

const navigateToDialogsList = (): void => {
  updateUrl({ type: RouteTypes.DIALOGS, id: null });
};

const navigateToGroup = (groupId: string): void => {
  updateUrl({ type: RouteTypes.GROUP, id: groupId });
};

const navigateToGroupsList = (): void => {
  updateUrl({ type: RouteTypes.GROUP, id: null });
};

const navigateToAssistant = (): void => {
  updateUrl({ type: RouteTypes.ASSISTANT, id: null });
};

const navigateToAI = (): void => {
  updateUrl({ type: RouteTypes.AI, id: null });
};

const navigateToDefault = (): void => {
  updateUrl({ type: RouteTypes.DEFAULT, id: null });
};

const initRoute = (): void => {
  currentRoute.value = parseUrl();
};

const setupUrlWatcher = (): void => {
  window.addEventListener('popstate', () => {
    currentRoute.value = parseUrl();
  });
};

const getIdForRouteType = (): { type: RouteType; id: string | null } => {
  const route = parseUrl();
  return { type: route.type, id: route.id };
};

export {
  currentRoute,
  parseUrl,
  initRoute,
  navigateToDialogs,
  navigateToDialogsList,
  navigateToGroup,
  navigateToGroupsList,
  navigateToAssistant,
  navigateToAI,
  navigateToDefault,
  getIdForRouteType,
  setupUrlWatcher,
  type RouteType,
  RouteTypes
};
