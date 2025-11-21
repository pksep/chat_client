import { defineCustomElement } from 'vue';
import ChatContainer from './components/ChatContainer.vue';
import { IMSDK } from './services/useOpenIM';
import ChatContainerNativeCE from './ChatContainer.ce.vue';

const ChatContainerCE = defineCustomElement(ChatContainerNativeCE);

customElements.define('chat-container', ChatContainerCE);

const logout = (): void => {
  IMSDK.logout();
};

export { ChatContainer, logout };

declare module 'vue' {
  interface GlobalComponents {
    'chat-container': typeof ChatContainerCE;
  }
}
