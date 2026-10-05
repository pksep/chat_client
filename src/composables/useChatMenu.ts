import { computed, ref } from 'vue';
import { useChatAccess } from './useChatAccess';

export type ChatMenuSection = 'chats' | 'calls' | 'clients' | 'ai' | 'profile';

const activeSection = ref<ChatMenuSection>('chats');

export const useChatMenu = () => {
  const setActiveSection = (section: ChatMenuSection): void => {
    const { access } = useChatAccess();
    if (
      (section === 'ai' && !access.value.ai) ||
      (section === 'clients' && !access.value.client)
    )
      return;
    activeSection.value = section;
  };

  const isSectionActive = (section: ChatMenuSection) =>
    computed(() => activeSection.value === section);

  return {
    activeSection,
    setActiveSection,
    isSectionActive
  };
};
