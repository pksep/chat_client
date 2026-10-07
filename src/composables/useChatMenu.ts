import { computed, ref } from 'vue';
import { useChatAccess } from './useChatAccess';

export type ChatMenuSection = 'chats' | 'calls' | 'clients' | 'ai' | 'profile';

const activeSection = ref<ChatMenuSection>('chats');
const animateSectionChange = ref(true);

export const useChatMenu = () => {
  const setActiveSection = (
    section: ChatMenuSection,
    { animate = true }: { animate?: boolean } = {}
  ): void => {
    const { access } = useChatAccess();
    if (
      (section === 'ai' && !access.value.ai) ||
      (section === 'clients' && !access.value.client)
    )
      return;
    // Синхронизация маршрута сохраняет анимацию уже выбранного перехода.
    if (activeSection.value === section) return;
    animateSectionChange.value = animate;
    activeSection.value = section;
  };

  const isSectionActive = (section: ChatMenuSection) =>
    computed(() => activeSection.value === section);

  return {
    activeSection,
    animateSectionChange,
    setActiveSection,
    isSectionActive
  };
};
