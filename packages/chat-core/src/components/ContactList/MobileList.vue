<template>
  <div
    class="mobile-list-container"
    role="main"
    :data-testid="`${dataTestid}-MobileList-Container`"
  >
    <section
      class="chat-list"
      role="region"
      aria-label="Contact list"
      :data-testid="`${dataTestid}-ChatList-Section`"
    >
      <ul
        class="chat-items-list"
        role="list"
        :data-testid="`${dataTestid}-ChatItems-List`"
      >
        <li
          class="chat-item"
          role="listitem"
          tabindex="0"
          @click="
            handleContactClick({
              name: 'Общий',
              lastMessage: 'Текст',
              time: '19:48'
            })
          "
          @keydown="
            event =>
              handleKeyDown(
                {
                  name: 'Общий',
                  lastMessage: 'Текст',
                  time: '19:48'
                },
                event
              )
          "
          aria-label="Contact Общий, last message: Текст, time: 19:48"
          :data-testid="`${dataTestid}-ChatItem-Item1`"
        >
          <div
            class="avatar"
            aria-label="Contact avatar"
            :data-testid="`${dataTestid}-ChatItem-Avatar1`"
          >
            О
          </div>
          <div
            class="chat-content"
            :data-testid="`${dataTestid}-ChatItem-Content1`"
          >
            <h3
              class="title"
              role="heading"
              aria-level="2"
              :data-testid="`${dataTestid}-ChatItem-Title1`"
            >
              Общий
            </h3>
            <p
              class="message"
              aria-label="Last message"
              :data-testid="`${dataTestid}-ChatItem-Message1`"
            >
              Текст
            </p>
          </div>
          <div
            class="chat-service"
            :data-testid="`${dataTestid}-ChatItem-Service1`"
          >
            <time
              class="time"
              datetime="19:48"
              aria-label="Message time"
              :data-testid="`${dataTestid}-ChatItem-Time1`"
              >19:48</time
            >
          </div>
        </li>

        <li
          class="chat-item"
          role="listitem"
          tabindex="0"
          @click="
            handleContactClick({
              name: 'Общий',
              lastMessage: 'Текст',
              time: '19:48'
            })
          "
          @keydown="
            event => {
              handleKeyDown(
                { name: 'Общий', lastMessage: 'Текст', time: '19:48' },
                event
              );
            }
          "
          aria-label="contact"
          :data-testid="`${dataTestid}-ChatItem-Item2`"
        >
          <div
            class="avatar"
            aria-label="Contact avatar"
            :data-testid="`${dataTestid}-ChatItem-Avatar2`"
          >
            О
          </div>
          <div
            class="chat-content"
            :data-testid="`${dataTestid}-ChatItem-Content2`"
          >
            <h3
              class="title"
              role="heading"
              aria-level="2"
              :data-testid="`${dataTestid}-ChatItem-Title2`"
            >
              Общий
            </h3>
            <p
              class="message"
              aria-label="Last message"
              :data-testid="`${dataTestid}-ChatItem-Message2`"
            >
              Текст
            </p>
          </div>
          <div
            class="chat-service"
            :data-testid="`${dataTestid}-ChatItem-Service2`"
          >
            <time
              class="time"
              datetime="19:48"
              aria-label="Message time"
              :data-testid="`${dataTestid}-ChatItem-Time2`"
              >19:48</time
            >
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
// Props
interface Props {
  contacts?: Array<any>;
  dataTestid?: string;
}

withDefaults(defineProps<Props>(), {
  contacts: () => [],
  dataTestid: () => 'MobileList'
});

// Emits
interface Emits {
  (e: 'contactClick', contact: any): void;
}

const emit = defineEmits<Emits>();

// Methods
const handleContactClick = (contact: any) => {
  emit('contactClick', contact);
};

// Keyboard navigation for accessibility
const handleKeyDown = (contact: any, event: KeyboardEvent) => {
  // Handle Enter or Space key to trigger click
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    emit('contactClick', contact);
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
  grid-template-rows: auto 1fr auto;
  border-radius: 18px;
  overflow: hidden;
  font-family: 'Inter', sans-serif;
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
  color: #181818;
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
