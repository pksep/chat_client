import { computed } from 'vue';

interface SliderMediaItem {
  path: string;
  fallbackPath?: string;
  name: string;
  downloadPath?: string;
  mediaType?: 'image' | 'video';
}

export const createLiveSliderItem = (
  build: () => SliderMediaItem
): SliderMediaItem => {
  const item = computed(build);
  return {
    get path(): string {
      return item.value.path;
    },
    get fallbackPath(): string | undefined {
      return item.value.fallbackPath;
    },
    get name(): string {
      return item.value.name;
    },
    get downloadPath(): string | undefined {
      return item.value.downloadPath;
    },
    get mediaType(): 'image' | 'video' | undefined {
      return item.value.mediaType;
    }
  };
};
