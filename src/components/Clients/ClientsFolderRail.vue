<template>
  <ChatFolderRail
    mobile
    scope="clients"
    :loading="loading"
    :folders="folders"
    :topics="topics"
    :selected-folder-id="selectedFolderId"
    :is-managing="isManaging"
    :system-active="!!selectedSystemFolder"
    is-active
    :auth-user-id="authUserId"
    @select="emits('select', $event)"
    @manage="emits('manage')"
  >
    <template #system-folders>
      <button
        v-for="folder in systemFolders"
        :key="folder.id"
        type="button"
        class="chat-folder-rail__item"
        :class="{
          'chat-folder-rail__item--active':
            !isManaging && selectedSystemFolder === folder.id
        }"
        :aria-pressed="!isManaging && selectedSystemFolder === folder.id"
        :data-testid="`Clients-SystemFolder-${folder.id}`"
        @click="emits('select-system', folder.id)"
      >
        <span class="chat-folder-rail__avatar">
          <ClientPlatformIcon
            v-if="folder.platform && !folder.icon"
            :platform="folder.platform"
          />
          <Icon v-else-if="folder.icon" :name="folder.icon" />
        </span>
        <span class="chat-folder-rail__label">{{ folder.label }}</span>
      </button>
    </template>
  </ChatFolderRail>
</template>

<script setup lang="ts">
import { Icon, type IconNameEnum } from '@pksep/yui';
import type { ChatFolder } from '../../services/useChatSDK/chat-folder';
import type { ITopic } from '../interfaces/interfaces';
import ChatFolderRail from '../Menu/ChatFolderRail.vue';
import ClientPlatformIcon from './ClientPlatformIcon.vue';

defineProps<{
  folders: readonly ChatFolder[];
  topics: ITopic[];
  selectedFolderId: string | null;
  isManaging: boolean;
  loading: boolean;
  authUserId?: string;
  selectedSystemFolder: string;
  systemFolders: {
    id: string;
    label: string;
    platform: string;
    icon: IconNameEnum | null;
  }[];
}>();

const emits = defineEmits<{
  (e: 'select', folderId: string | null): void;
  (e: 'select-system', folderId: string): void;
  (e: 'manage'): void;
}>();
</script>
