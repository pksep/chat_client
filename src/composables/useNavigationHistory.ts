import { reactive } from 'vue';
import type { IUserProps } from '../components/interfaces/interfaces';

export interface NavigationHistoryItem {
  chapter: string | null;
  contact: IUserProps | null;
  timestamp: number;
}

export interface NavigationHistoryState {
  history: NavigationHistoryItem[];
  currentChapter: string | null;
  currentContact: IUserProps | null;
}

export interface NavigationConfig {
  chapter: string | null;
  contact: IUserProps | null;
}

export function useNavigationHistory() {
  const state = reactive<NavigationHistoryState>({
    history: [],
    currentChapter: null,
    currentContact: null
  });

  // Initialize from session storage
  const initializeFromStorage = () => {
    const savedHistory = sessionStorage.getItem('navigationHistory');
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        state.history = parsed.history || [];
        state.currentChapter = parsed.currentChapter || null;
        state.currentContact = parsed.currentContact || null;
      } catch (error) {
        console.warn(
          'Failed to parse navigation history from session storage:',
          error
        );
        // Initialize with empty state if parsing fails
        state.history = [];
        state.currentChapter = null;
        state.currentContact = null;
      }
    }
  };

  // Clear navigation history on page refresh or when explicitly needed
  const clearNavigationHistory = () => {
    state.history = [];
    state.currentChapter = null;
    state.currentContact = null;
    sessionStorage.removeItem('navigationHistory');
  };

  // Save to session storage
  const saveToStorage = () => {
    sessionStorage.setItem(
      'navigationHistory',
      JSON.stringify({
        history: state.history,
        currentChapter: state.currentChapter,
        currentContact: state.currentContact
      })
    );
  };

  // Add current state to history
  const addToHistory = (chapter: string | null, contact: IUserProps | null) => {
    if (state.currentChapter !== null && state.currentChapter !== undefined) {
      state.history.push({
        chapter: state.currentChapter,
        contact: state.currentContact,
        timestamp: Date.now()
      });
      // Limit history to last 20 items to prevent memory issues
      if (state.history.length > 20) {
        state.history = state.history.slice(-20);
      }
    }
    state.currentChapter = chapter;
    state.currentContact = contact;
    saveToStorage();
  };

  // Navigate to a new state with history tracking
  const navigateTo = (chapter: string | null, contact: IUserProps | null) => {
    // Save current state to history before navigating
    addToHistory(state.currentChapter, state.currentContact);

    // Update to new state
    state.currentChapter = chapter;
    state.currentContact = contact;
  };

  // Navigate back to previous state
  const navigateBack = (): NavigationHistoryItem | null => {
    if (state.history.length > 0) {
      const previousState = state.history.pop();
      if (previousState) {
        state.currentChapter = previousState.chapter;
        state.currentContact = previousState.contact;
        saveToStorage();
        return previousState;
      }
    }
    return null;
  };

  // Clear history
  const clearHistory = () => {
    state.history = [];
    state.currentChapter = null;
    state.currentContact = null;
    saveToStorage();
  };

  // Initialize on first access
  initializeFromStorage();

  return {
    state,
    addToHistory,
    navigateTo,
    navigateBack,
    clearHistory,
    clearNavigationHistory
  };
}
