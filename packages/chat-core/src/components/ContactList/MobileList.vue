<template>
  <div
    class="mobile-list-container"
    role="main"
    :data-testid="`${props.dataTestid}-MobileList-Container`"
  >
    <div v-if="props.chapter === 'assistant'">
      <button
        class="menu__user-assistant"
        @click="handleChapter('ai')"
        :data-testid="`${props.dataTestid}-AIAssistant-Button`"
      >
        <AiIconWrapper :data-testid="`${props.dataTestid}-AIAssistant-Icon`" />
        <h3
          class="menu__user-assistant-title"
          :data-testid="`${props.dataTestid}-AIAssistant-Title`"
        >
          AI Ассистент
        </h3>
      </button>
      <Line
        class="menu__user-line"
        :data-testid="`${props.dataTestid}-AIAssistant-Line`"
      />
    </div>

    <section
      v-else
      class="chat-list"
      role="region"
      aria-label="Contact list"
      :data-testid="`${props.dataTestid}-ChatList-Section`"
    >
      <ContactList
        :contacts="props.contacts"
        :data-testid="`${props.dataTestid}-ContactList`"
        @unmount-click="handleChapter"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import AiIconWrapper from '../AiIconWrapper.vue';
import Line from '../Line.vue';
import ContactList from './ContactList.vue';
import type { IMobileListProps } from './interfaces/mobile-list';
import type { IMenuEmits } from '../interfaces/interfaces';

const props = withDefaults(defineProps<IMobileListProps>(), {
  contacts: () => [],
  dataTestid: () => 'MobileList'
});

const emits = defineEmits<IMenuEmits>();

const handleChapter = (
  chapter: { name: string; contact: any } | string | null
): void => {
  if (typeof chapter === 'string') {
    emits('unmount-chapter', chapter);
  } else if (chapter && chapter.name) {
    emits('unmount-chapter', chapter);
  } else {
    emits('unmount-chapter', null);
  }
};
</script>

<style scoped>
.mobile-list-container {
  width: 100%;
  max-width: 412px;
  height: 892px;
  background-color: #ffffff;
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  border-radius: 18px;
  overflow: hidden;
}

.status-bar {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: end;
  padding: 10px 24px;
  background-color: #ffffff;
  height: 52px;
  gap: 286px;
}

.status-bar .time {
  font-weight: 500;
  font-size: 14px;
  letter-spacing: 1%;
  color: var(--text-black);
  justify-self: start;
}

.status-bar .right-icons {
  width: 46px;
  height: 17px;
  justify-self: end;
}

.chat-list {
  display: grid;
  grid-template-rows: 1fr;
  overflow-y: auto;
}

.chat-items-list {
  display: grid;
  grid-template-rows: repeat(auto-fit, minmax(80px, auto));
  overflow-y: auto;
  gap: 0;
  list-style: none;
  padding: 0;
  margin: 0;
}

.chat-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-areas: 'avatar content service';
  align-items: center;
  padding: 10px 0;
  position: relative;
  height: 80px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.chat-item:focus {
  outline: 2px solid #77a6ff;
  outline-offset: -2px;
}

.chat-item:hover {
  background-color: #f9f9f9;
}

.chat-item:not(:last-child)::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 80px;
  width: 339px;
  height: 0;
  border-bottom: 0.35px solid #e7e7e7;
}

.chat-item .avatar {
  grid-area: avatar;
  width: 60px;
  height: 60px;
  border-radius: 100%;
  background-color: #ff6868;
  display: grid;
  place-items: center;
  color: #ffffff;
  font-size: 20px;
  margin-left: 10px;
  justify-self: start;
}

.chat-content {
  grid-area: content;
  display: grid;
  grid-template-rows: auto auto;
  gap: 2px;
  margin: 0 10px;
  overflow: hidden;
}

.chat-content .title {
  font-weight: 700;
  font-size: 16px;
  color: #181818;
  align-self: end;
  margin: 0;
}

.chat-content .message {
  font-weight: 400;
  font-size: 16px;
  color: #757d8a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  align-self: start;
  margin: 0;
}

.chat-service {
  grid-area: service;
  display: grid;
  grid-template-columns: auto;
  align-items: center;
  gap: 1px;
  margin-right: 10px;
  justify-self: end;
}

.chat-service .time {
  font-weight: 400;
  font-size: 12px;
  color: #757d8a;
  text-align: right;
  padding: 2px 0;
  margin: 0;
}

/* AI Assistant styles */
.menu__user-assistant {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  background: transparent;
  border: none;
  cursor: pointer;
  width: 100%;
  text-align: left;
}

.menu__user-assistant-title {
  margin: 0 0 0 12px;
  font-size: 16px;
  font-weight: 600;
  color: #181818;
}

.menu__user-line {
  margin: 0 20px;
}

/* Bottom app bar styling */
.bottom-app-bar {
  display: grid;
  justify-content: end;
  align-items: center;
  padding: 10px;
  background-color: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(40px);
}

@media (max-width: 768px) {
  .mobile-list-container {
    width: 100%;
    height: 100vh;
    max-width: 100%;
    border-radius: 0;
  }

  .chat-item .avatar {
    margin-left: 16px;
  }

  .chat-content {
    margin: 0 16px;
  }

  .chat-service {
    margin-right: 16px;
  }
}

@media (max-width: 480px) {
  .status-bar {
    padding: 10px 16px;
  }

  .mobile-list-container {
    height: 100vh;
  }
}
</style>
