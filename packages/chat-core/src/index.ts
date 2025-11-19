import { defineCustomElement } from 'vue';
import ChatContainer from './components/ChatContainer.vue';
import ChatContainerNativeCE from './ChatContainer.ce.vue';
import { getSDK } from '@openim/wasm-client-sdk';

const ChatContainerCE = defineCustomElement(ChatContainerNativeCE);

customElements.define('chat-container', ChatContainerCE);

type IMSDKType = ReturnType<typeof getSDK>;

export const IMSDK: IMSDKType = getSDK({ debug: false });

console.log('START OPENIM');

const logout = (): void => {
  IMSDK.logout();
};

export { ChatContainer, logout };

declare module 'vue' {
  interface GlobalComponents {
    'chat-container': typeof ChatContainerCE;
  }
}
