import { createApp, h, nextTick, ref } from 'vue';
import { SliderModal } from '@pksep/yui';
export { ref } from 'vue';

export interface SliderDownloadFixtureItem {
  path: string;
  fallbackPath?: string;
  downloadPath: string;
  name: string;
}

export const mountSliderDownloadFixture = async (
  items: SliderDownloadFixtureItem[],
  defaultIndex = 0
) => {
  const root = document.createElement('div');
  root.id = 'slider-download-fixture';
  document.body.appendChild(root);
  const open = ref(false);

  const app = createApp({
    render: () =>
      h(SliderModal, {
        open: open.value,
        items,
        defaultIndex,
        dataTestid: 'SliderDownloadRegression'
      })
  });

  app.mount(root);
  await nextTick();
  open.value = true;
  await nextTick();

  return {
    items,
    unmount: () => {
      app.unmount();
      root.remove();
    }
  };
};

export const mountMessageMediaFixture = async (
  onOpen: (index: number) => void
) => {
  const { default: MessageBubbleMedia } = await import(
    '../../src/components/Messages/MessageBubbleMedia.vue'
  );
  const { setConfig } = await import('../../src/services/useConfig');
  const { MediaType } = await import('@pksep/zod-shared-chat');
  setConfig({ CHAT_PATH_TO_FILE_CDN: location.origin });
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp({
    render: () =>
      h(MessageBubbleMedia, {
        message: '',
        isMeSender: true,
        dataTestid: 'MediaClick',
        media: [0, 1].map(index => ({
          id: String(index),
          path: `__slider-video-${index}.mp4`,
          thumbnailPath: `__slider-thumbnail-${index}.svg`,
          type: MediaType.Video,
          originName: `video-${index}.mp4`,
          size: 100,
          ex: { width: 160, height: 90 }
        })),
        onSetSlider: (_items: unknown, index: number) => onOpen(index)
      })
  });
  app.mount(root);
  await nextTick();
  return {
    unmount: () => {
      app.unmount();
      root.remove();
    }
  };
};
