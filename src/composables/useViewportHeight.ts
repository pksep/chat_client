import { onMounted, onBeforeUnmount } from 'vue';

export function useViewportHeight() {
  const setHeight = () => {
    const h = window.visualViewport
      ? window.visualViewport.height
      : window.innerHeight;

    document.documentElement.style.setProperty('--default-height', `${h}px`);
  };

  onMounted(() => {
    setHeight();
    window.visualViewport?.addEventListener('resize', setHeight);
    window.addEventListener('resize', setHeight);
  });

  onBeforeUnmount(() => {
    window.visualViewport?.removeEventListener('resize', setHeight);
    window.removeEventListener('resize', setHeight);
  });
}
