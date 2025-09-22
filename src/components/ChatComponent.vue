<template>
  <!-- Chat Area Section -->
  <div class="chat-area">
    <div v-if="activeContact" class="chat-header">
      <h3>{{ activeContact.name }}</h3>
      <span class="timestamp">{{ activeContact.lastSeen }}</span>
    </div>
    <div v-else class="chat-header">
      <h3>Select a chat</h3>
    </div>

    <div class="messages-area">
      <!-- Display messages for the active contact -->
      <div v-if="activeContact && activeContact.messages.length">
        <div
          v-for="(message, index) in activeContact.messages"
          :key="index"
          class="message"
          :class="{ 'own-message': message.isOwn }"
        >
          {{ message.text }}
          <span v-if="message.timestamp" class="message-timestamp">{{
            message.timestamp
          }}</span>
        </div>
      </div>
      <div v-else-if="activeContact" class="no-messages">No messages yet.</div>
      <div v-else class="no-chat-selected">
        Please select a contact to start chatting.
      </div>
    </div>

    <!-- Input Area (Basic) -->
    <div v-if="activeContact" class="input-area">
      <input
        type="text"
        v-model="newMessage"
        placeholder="Type a message..."
        @keyup.enter="sendMessage"
        class="message-input"
      />
      <button @click="sendMessage" class="send-button">Send</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

// Define types for our data
// --- Reactive State ---

// Send a new message to the active contact
const sendMessage = () => {
  if (newMessage.value.trim() !== '' && activeContact.value) {
    const messageToSend: Message = {
      text: newMessage.value,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      }), // Use current time
      isOwn: true // Assume sent message is from the current user
    };
    activeContact.value.messages.push(messageToSend);
    newMessage.value = ''; // Clear the input
  }
};
</script>

<style scoped>
.star-indicator {
  color: gold; /* Style the star */
}

.chat-area {
  width: 70%;
  display: flex;
  flex-direction: column;
}

.chat-header {
  padding: 20px;
  border-bottom: 1px solid #ddd;
  background-color: #fafafa;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.messages-area {
  flex-grow: 1;
  padding: 20px;
  overflow-y: auto;
  background-color: #fff;
}

.message {
  margin-bottom: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  max-width: 70%;
  word-wrap: break-word;
}

.message.own-message {
  background-color: #dcf8c6; /* Light green for own messages */
  margin-left: auto; /* Align to the right */
}

.message-timestamp {
  display: block;
  font-size: 0.75em;
  color: #888;
  text-align: right;
  margin-top: 4px;
}

.no-messages,
.no-chat-selected {
  color: #888;
  font-style: italic;
  text-align: center;
  margin-top: 50px;
}

.input-area {
  display: flex;
  padding: 10px;
  border-top: 1px solid #ddd;
  background-color: #f5f5f5;
}

.message-input {
  flex-grow: 1;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-right: 10px;
}

.send-button {
  padding: 10px 15px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.send-button:hover {
  background-color: #0056b3;
}
</style>
