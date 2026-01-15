import { ref } from 'vue';

type RouteType = 'dialogs' | 'group' | 'assistant' | 'ai' | 'default';

interface Route {
  type: RouteType;
  id: string | null;
}

const currentRoute = ref<Route>({ type: 'default', id: null });

const parseUrl = (): Route => {
  const url = new URL(window.location.href);
  const pathParts = url.pathname.split('/').filter(part => part !== '');

  if (pathParts.length >= 2) {
    const type = pathParts[0];
    const id = pathParts[1];

    if (type === 'dialogs' && id) {
      return { type: 'dialogs', id };
    } else if (type === 'group' && id) {
      return { type: 'group', id };
    }
  } else if (pathParts.length === 1) {
    const type = pathParts[0];

    if (type === 'dialogs') {
      return { type: 'dialogs', id: null };
    } else if (type === 'group') {
      return { type: 'group', id: null };
    } else if (type === 'assistant') {
      return { type: 'assistant', id: null };
    } else if (type === 'ai') {
      return { type: 'ai', id: null };
    }
  }

  const dialogsId = url.searchParams.get('dialogs');
  const groupId = url.searchParams.get('group');

  if (dialogsId) {
    return { type: 'dialogs', id: dialogsId };
  } else if (groupId) {
    return { type: 'group', id: groupId };
  }

  return { type: 'default', id: null };
};

const updateUrl = (route: Route): void => {
  let newUrl: string;

  if (route.type === 'dialogs' && route.id) {
    newUrl = `${window.location.origin}/dialogs/${route.id}`;
  } else if (route.type === 'dialogs' && !route.id) {
    newUrl = `${window.location.origin}/dialogs`;
  } else if (route.type === 'group' && route.id) {
    newUrl = `${window.location.origin}/group/${route.id}`;
  } else if (route.type === 'group' && !route.id) {
    newUrl = `${window.location.origin}/group`;
  } else if (route.type === 'assistant' && !route.id) {
    newUrl = `${window.location.origin}/assistant`;
  } else if (route.type === 'ai' && !route.id) {
    newUrl = `${window.location.origin}/ai`;
  } else {
    newUrl = window.location.origin + window.location.pathname;
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
  updateUrl({ type: 'dialogs', id: dialogsId });
};

const navigateToDialogsList = (): void => {
  updateUrl({ type: 'dialogs', id: null });
};

const navigateToGroup = (groupId: string): void => {
  updateUrl({ type: 'group', id: groupId });
};

const navigateToGroupsList = (): void => {
  updateUrl({ type: 'group', id: null });
};

const navigateToAssistant = (): void => {
  updateUrl({ type: 'assistant', id: null });
};

const navigateToAI = (): void => {
  updateUrl({ type: 'ai', id: null });
};

const navigateToDefault = (): void => {
  updateUrl({ type: 'default', id: null });
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
  type RouteType
};
