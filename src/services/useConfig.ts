import { IChatContainerConfig } from '../components/interfaces/interfaces';
import { ref } from 'vue';

const configStore = ref<IChatContainerConfig>({});
const CONFIG_KEYS: Array<keyof IChatContainerConfig> = [
  'CHAT_AUTH_WITH_LOGIN',
  'CHAT_MASTRA_URL',
  'CHAT_API_DOMAIN',
  'CHAT_WS_DOMAIN',
  'CHAT_ERP_URL',
  'CHAT_PATH_TO_FILE_CDN',
  'CHAT_LIVEKIT_URL',
  'CHAT_BOT_GATEWAY',
  'CHAT_CALL_TOPIC_AUTO_PROMPT_ENABLED',
  'CHAT_MULTIPART_UPLOAD_CONCURRENCY'
];

export const areChatConfigsEqual = (
  left?: IChatContainerConfig | null,
  right?: IChatContainerConfig | null
): boolean => {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return CONFIG_KEYS.every(key => (left[key] ?? '') === (right[key] ?? ''));
};

export const setConfig = (config: IChatContainerConfig) => {
  if (areChatConfigsEqual(configStore.value, config)) {
    return;
  }

  configStore.value = config;
};

export const getConfig = () => configStore.value;
