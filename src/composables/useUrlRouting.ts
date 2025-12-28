import { ref, watch } from 'vue';

// Define the possible URL route types
type RouteType = 'direct' | 'group' | 'default';

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

  // Check if we have a path like /direct/:id or /group/:id
  if (pathParts.length >= 2) {
    const type = pathParts[0];
    const id = pathParts[1];

    if (type === 'direct' && id) {
      return { type: 'direct', id };
    } else if (type === 'group' && id) {
      return { type: 'group', id };
    }
  }

  // Check for query parameters as fallback
  const directId = url.searchParams.get('direct');
  const groupId = url.searchParams.get('group');

  if (directId) {
    return { type: 'direct', id: directId };
  } else if (groupId) {
    return { type: 'group', id: groupId };
  }

  return { type: 'default', id: null };
};

// Function to update the URL based on the current route
const updateUrl = (route: Route): void => {
  let newUrl: string;

  if (route.type === 'direct' && route.id) {
    newUrl = `${window.location.origin}/direct/${route.id}`;
  } else if (route.type === 'group' && route.id) {
    newUrl = `${window.location.origin}/group/${route.id}`;
  } else {
    // For default view, just keep the base URL
    newUrl = window.location.origin + window.location.pathname;
  }

  // Preserve other query parameters
  const currentUrl = new URL(window.location.href);
  const searchParams = new URLSearchParams(currentUrl.search);

  // Remove direct and group params since we're using path-based routing now
  searchParams.delete('direct');
  searchParams.delete('group');

  // Add back any remaining parameters
  if (searchParams.toString()) {
    newUrl += '?' + searchParams.toString();
  }

  // Update the browser history
  window.history.replaceState({}, document.title, newUrl);
  currentRoute.value = route;
};

// Function to navigate to a specific direct chat
const navigateToDirect = (directId: string): void => {
  updateUrl({ type: 'direct', id: directId });
};

// Function to navigate to a specific group
const navigateToGroup = (groupId: string): void => {
  updateUrl({ type: 'group', id: groupId });
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
  navigateToDirect,
  navigateToGroup,
  navigateToDefault,
  setupUrlWatcher
};
