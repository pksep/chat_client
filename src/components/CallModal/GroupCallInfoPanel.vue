<template>
  <MobileModal
    v-if="isMobile"
    :open="open"
    :title="title"
    close-button-text="Назад"
    @unmount-close="$emit('close')"
    data-testid="GroupCallInfoPanel"
  >
    <template #header>
      <button class="call-modal__group-panel-back" @click="$emit('close')">
        Назад
      </button>
      <div class="call-modal__group-panel-title">
        <p>{{ title }}</p>
        <span>{{ meta }}</span>
      </div>
      <div class="call-modal__group-panel-spacer"></div>
    </template>

    <div class="call-modal__group-panel-content">
      <button class="call-modal__group-panel-copy" @click="handleCopyLink">
        <LinkIcon />
        <span>Скопировать ссылку</span>
      </button>

      <div class="call-modal__group-panel-members">
        <button
          v-for="member in members"
          :key="member.id"
          class="call-modal__group-panel-member"
        >
          <CachedAvatar
            :path="member.avatarUrl"
            :initials="member.initials"
            :alt="member.initials"
            class="call-modal__group-panel-avatar"
          />

          <div class="call-modal__group-panel-member-text">
            <p>{{ member.initials }}</p>
            <span>{{ member.nickname ? `@${member.nickname}` : '' }}</span>
          </div>
        </button>
      </div>
    </div>
  </MobileModal>

  <Transition name="call-modal-group-panel">
    <div v-if="open && !isMobile" class="call-modal__group-panel">
      <div class="call-modal__group-panel-header">
        <div class="call-modal__group-panel-spacer"></div>
        <div class="call-modal__group-panel-title">
          <p>{{ title }}</p>
          <span>{{ meta }}</span>
        </div>
        <button class="call-modal__group-panel-close" @click="$emit('close')">
          ×
        </button>
      </div>

      <div class="call-modal__group-panel-content">
        <button class="call-modal__group-panel-copy" @click="handleCopyLink">
          <LinkIcon />
          <span>Скопировать ссылку</span>
        </button>

        <div class="call-modal__group-panel-members">
          <button
            v-for="member in members"
            :key="member.id"
            class="call-modal__group-panel-member"
          >
            <CachedAvatar
              :path="member.avatarUrl"
              :initials="member.initials"
              :alt="member.initials"
              class="call-modal__group-panel-avatar"
            />

            <div class="call-modal__group-panel-member-text">
              <p>{{ member.initials }}</p>
              <span>{{ member.nickname ? `@${member.nickname}` : '' }}</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import LinkIcon from '../UI/LinkIcon.vue';
import MobileModal from '../UI/MobileModal.vue';
import type { IUser } from '../interfaces/interfaces';
import CachedAvatar from '../UI/CachedAvatar.vue';

const props = defineProps<{
  open: boolean;
  isMobile: boolean;
  title: string;
  meta: string;
  members: IUser[];
  onCopyLink?: () => Promise<boolean | void>;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

const handleCopyLink = async () => {
  try {
    if (props.onCopyLink) {
      await props.onCopyLink();
      return;
    }

    await navigator.clipboard.writeText(window.location.href);
  } catch (error) {
    console.warn('Failed to copy group call link', error);
  }
};
</script>
