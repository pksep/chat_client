import { computed, ref } from 'vue';

export type ChatMenuSection = 'chats' | 'calls' | 'clients' | 'ai' | 'profile';

const activeSection = ref<ChatMenuSection>('chats');

export const useChatMenu = () => {
  const setActiveSection = (section: ChatMenuSection): void => {
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
