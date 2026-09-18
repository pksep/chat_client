const PAGE_RELOAD_INTENT_TTL_MS = 5000;

let pageReloadIntentAt = 0;

export const markLiveKitPageReloadIntent = () => {
  pageReloadIntentAt = Date.now();
};

export const isLiveKitPageReloadIntentActive = () =>
  pageReloadIntentAt > 0 &&
  Date.now() - pageReloadIntentAt <= PAGE_RELOAD_INTENT_TTL_MS;
