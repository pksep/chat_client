import { computed } from 'vue';

interface SliderMediaItem {
  path: string;
  fallbackPath?: string;
  name: string;
  downloadPath?: string;
}

export const createLiveSliderItem = (
  build: () => SliderMediaItem
): SliderMediaItem => {
  const item = computed(build);
  return {
    get path() {
      return item.value.path;
    },
    get fallbackPath() {
      return item.value.fallbackPath;
    },
    get name() {
      return item.value.name;
    },
    get downloadPath() {
      return item.value.downloadPath;
    }
  };
};
