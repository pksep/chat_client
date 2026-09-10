import { useChatWallpaper } from '../../src/composables/useChatWallpaper';
import { useCallBackground } from '../../src/composables/useCallBackground';
import * as sync from '../../src/services/useCustomBackgroundSync';

export const initializeBackgroundFixture = () => {
  const wallpaper = useChatWallpaper();
  const call = useCallBackground();
  const api = {
    getCustomBackgrounds: async kind =>
      (await fetch(`/test-background-api/${kind}`)).json(),
    getCustomBackground: async (kind, id) =>
      (await fetch(`/test-background-api/${kind}/${id}`)).json(),
    saveCustomBackground: async (kind, image) =>
      (
        await fetch(`/test-background-api/${kind}`, {
          method: 'POST',
          body: JSON.stringify(image)
        })
      ).json()
  };
  sync.configureCustomBackgroundSync('test-server:user', api);
  return { wallpaper, call, sync };
};
