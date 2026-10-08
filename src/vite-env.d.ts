/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/pwa-assets" />

interface ImportMetaEnv {
  readonly VITE_EMOJI_ASSET_BASE_URL?: string;
  readonly VITE_EMOJI_ANIMATION_ASSET_BASE_URL?: string;
  readonly VITE_STICKER_ASSET_BASE_URL?: string;
  readonly VITE_CALL_BACKGROUND_ASSET_BASE_URL?: string;
  readonly VITE_REACTION_VIDEO_ASSET_BASE_URL?: string;
  readonly VITE_BOT_GATEWAY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
