import { onMounted, onUnmounted } from 'vue';

interface UseAndroidBackButtonOptions {
  onBack?: () => void; // Function to call when back button is pressed
  addToHistory?: boolean; // Whether to add current state to history
  state?: any; // State to store in history
  title?: string; // Title for the history entry
}

export function useAndroidBackButton(
  options: UseAndroidBackButtonOptions = {}
) {
  const {
    onBack,
    addToHistory = true,
    state = null,
    title = document.title
  } = options;

  const handlePopState = (event: PopStateEvent) => {
    // Prevent default browser back/forward behavior
    event.preventDefault();

    // Call the custom back handler if provided
    if (onBack) {
      onBack();
    } else {
      // Default behavior: go back to main screen
      window.history.pushState({}, document.title, window.location.pathname);
    }
  };

  onMounted(() => {
    // Add current state to history if requested
    if (addToHistory) {
      window.history.pushState(state, title, window.location.href);
    }

    // Listen for popstate events (triggered by back/forward button)
    window.addEventListener('popstate', handlePopState);
  });

  onUnmounted(() => {
    // Remove the event listener when component is unmounted
    window.removeEventListener('popstate', handlePopState);
  });

  // Function to add new state to history
  const addToHistoryState = (
    newState: any = null,
    newTitle: string = document.title,
    url: string = window.location.href
  ) => {
    window.history.pushState(newState, newTitle, url);
  };

  // Function to replace current state
  const replaceCurrentState = (
    newState: any = null,
    newTitle: string = document.title,
    url: string = window.location.href
  ) => {
    window.history.replaceState(newState, newTitle, url);
  };

  // Function to navigate to main screen
  const navigateToMainScreen = () => {
    // Replace current state with main screen
    window.history.pushState({}, document.title, window.location.pathname);
  };

  return {
    navigateToMainScreen,
    addToHistoryState,
    replaceCurrentState
  };
}
