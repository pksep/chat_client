import { ref, watch } from 'vue';

// Define the possible URL route types
type RouteType = 'dialogs' | 'group' | 'assistant' | 'ai' | 'default';

// Define the route structure
interface Route {
  type: RouteType;
  id: string | null;
}

// Create a reactive reference to track the current route
const currentRoute = ref<Route>({ type: 'default', id: null });

// Function to parse the current URL and extract route information
const parseUrl = (): Route => {
  const url = new URL(window.location.href);
  const pathParts = url.pathname.split('/').filter(part => part !== '');

  // Check if we have a path like /dialogs/:id, /dialogs, /group/:id, /group, /assistant, or /ai
  if (pathParts.length >= 2) {
    const type = pathParts[0];
    const id = pathParts[1];

    if (type === 'dialogs' && id) {
      return { type: 'dialogs', id };
    } else if (type === 'group' && id) {
      return { type: 'group', id };
    }
  } else if (pathParts.length === 1) {
    // Check for paths like /dialogs, /group, /assistant, /ai (list views)
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

  // Check for query parameters as fallback
  const dialogsId = url.searchParams.get('dialogs');
  const groupId = url.searchParams.get('group');

  if (dialogsId) {
    return { type: 'dialogs', id: dialogsId };
  } else if (groupId) {
    return { type: 'group', id: groupId };
  }

  return { type: 'default', id: null };
};

// Function to update the URL based on the current route
const updateUrl = (route: Route): void => {
  let newUrl: string;

  if (route.type === 'dialogs' && route.id) {
    newUrl = `${window.location.origin}/dialogs/${route.id}`;
  } else if (route.type === 'dialogs' && !route.id) {
    // For dialogs list view (no specific ID)
    newUrl = `${window.location.origin}/dialogs`;
  } else if (route.type === 'group' && route.id) {
    newUrl = `${window.location.origin}/group/${route.id}`;
  } else if (route.type === 'group' && !route.id) {
    // For group list view (no specific ID)
    newUrl = `${window.location.origin}/group`;
  } else if (route.type === 'assistant' && !route.id) {
    // For assistant view
    newUrl = `${window.location.origin}/assistant`;
  } else if (route.type === 'ai' && !route.id) {
    // For AI view
    newUrl = `${window.location.origin}/ai`;
  } else {
    // For default view, just keep the base URL
    newUrl = window.location.origin + window.location.pathname;
  }

  // Preserve other query parameters
  const currentUrl = new URL(window.location.href);
  const searchParams = new URLSearchParams(currentUrl.search);

  // Remove dialogs, group, assistant, and ai params since we're using path-based routing now
  searchParams.delete('dialogs');
  searchParams.delete('group');
  searchParams.delete('assistant');
  searchParams.delete('ai');

  // Add back any remaining parameters
  if (searchParams.toString()) {
    newUrl += '?' + searchParams.toString();
  }

  // Update the browser history
  window.history.replaceState({}, document.title, newUrl);
  currentRoute.value = route;
};

// Function to navigate to a specific dialogs chat
const navigateToDialogs = (dialogsId: string): void => {
  console.log('navigateToDialogs', dialogsId);
  updateUrl({ type: 'dialogs', id: dialogsId });
};

// Function to navigate to the dialogs list view
const navigateToDialogsList = (): void => {
  updateUrl({ type: 'dialogs', id: null });
};

// Function to navigate to a specific group
const navigateToGroup = (groupId: string): void => {
  updateUrl({ type: 'group', id: groupId });
};

// Function to navigate to the groups list view
const navigateToGroupsList = (): void => {
  updateUrl({ type: 'group', id: null });
};

// Function to navigate to the assistant view
const navigateToAssistant = (): void => {
  updateUrl({ type: 'assistant', id: null });
};

// Function to navigate to the AI view
const navigateToAI = (): void => {
  updateUrl({ type: 'ai', id: null });
};

// Function to navigate to the default view
const navigateToDefault = (): void => {
  updateUrl({ type: 'default', id: null });
};

// Initialize the route when the composable is created
const initRoute = (): void => {
  currentRoute.value = parseUrl();
};

// Watch for URL changes (e.g., browser back/forward buttons)
const setupUrlWatcher = (): void => {
  window.addEventListener('popstate', () => {
    currentRoute.value = parseUrl();
  });
};

export {
  currentRoute,
  initRoute,
  navigateToDialogs,
  navigateToDialogsList,
  navigateToGroup,
  navigateToGroupsList,
  navigateToAssistant,
  navigateToAI,
  navigateToDefault,
  setupUrlWatcher
};
