import { reactive, watch } from 'vue';
import type { IUserProps } from '../components/interfaces/interfaces';
import { useNavigationHistory } from '../composables/useNavigationHistory';
import { markAsRead } from './useOpenIM';
import { fetchGroupMemberCount } from './useGroup';

export type NavigationTarget =
  | { type: 'view'; view: 'ai' | 'assistant' | 'channels' | 'dialogs' }
  | { type: 'contact'; contact: IUserProps }
  | { type: 'reset' };

export interface NavigationServiceState {
  currentChapter: string | null;
  currentContact: IUserProps | null;
  isChapter: boolean;
}

export interface NavigationOptions {
  markAsRead?: boolean;
  updateMemberCount?: boolean;
}

export function useNavigationService() {
  const {
    state: navigationHistoryState,
    navigateTo,
    navigateBack,
    clearNavigationHistory
  } = useNavigationHistory();

  const state = reactive<NavigationServiceState>({
    currentChapter: navigationHistoryState.currentChapter,
    currentContact: navigationHistoryState.currentContact,
    isChapter:
      navigationHistoryState.currentChapter !== null &&
      navigationHistoryState.currentChapter !== 'assistant'
  });

  watch(
    () => navigationHistoryState.currentChapter,
    newChapter => {
      state.currentChapter = newChapter;
      updateIsChapterState(newChapter);
    }
  );

  watch(
    () => navigationHistoryState.currentContact,
    newContact => {
      state.currentContact = newContact;
      updateIsChapterState(state.currentChapter);
    }
  );

  const updateIsChapterState = (chapter: string | null) => {
    state.isChapter = chapter !== null && chapter !== 'assistant';
  };

  const navigateToTarget = async (
    target: NavigationTarget,
    options: NavigationOptions = {}
  ): Promise<void> => {
    const { markAsRead: shouldMarkAsRead = true, updateMemberCount = true } =
      options;

    let chapter: string | null = null;
    let contact: IUserProps | null = null;

    switch (target.type) {
      case 'view':
        chapter = target.view;
        contact = null;
        break;

      case 'contact': {
        let processedContact = { ...target.contact };

        if (shouldMarkAsRead && processedContact.id) {
          try {
            await markAsRead(processedContact.id);
          } catch (error) {
            console.warn('Failed to mark messages as read:', error);
          }
        }

        if (updateMemberCount && processedContact.groupId) {
          try {
            const memberCount = await fetchGroupMemberCount(
              processedContact.groupId
            );
            processedContact = {
              ...processedContact,
              membersLength: memberCount
            };
          } catch (error) {
            console.warn('Failed to fetch group member count:', error);
          }
        }
        chapter =
          processedContact.conversationId || processedContact.nickname || null;
        contact = processedContact;
        break;
      }

      case 'reset':
        chapter = null;
        contact = null;
        break;
    }

    navigateTo(chapter, contact);
  };

  const navigateBackToPrevious = (): boolean => {
    const previousState = navigateBack();
    return previousState !== null;
  };

  const resetNavigation = (): void => {
    navigateTo(null, null);
    clearNavigationHistory();
  };

  return {
    state,
    navigateToTarget,
    navigateBackToPrevious,
    resetNavigation,
    navigationHistoryState
  };
}
