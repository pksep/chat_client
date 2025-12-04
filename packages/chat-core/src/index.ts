import { defineCustomElement } from 'vue';
import ChatContainer from './components/ChatContainer.vue';
import ChatContainerNativeCE from './ChatContainer.ce.vue';

const ChatContainerCE = defineCustomElement(ChatContainerNativeCE);

customElements.define('chat-container', ChatContainerCE);

export { ChatContainer };

declare module 'vue' {
  interface GlobalComponents {
    'chat-container': typeof ChatContainerCE;
  }
}
