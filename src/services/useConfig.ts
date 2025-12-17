import { IChatContainerConfig } from '../components/interfaces/interfaces';
import { ref } from 'vue';

const configStore = ref<IChatContainerConfig>({});

export const setConfig = (config: IChatContainerConfig) => {
  configStore.value = config;
};

export const getConfig = () => configStore.value;
