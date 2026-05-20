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
    </template>

    <div class="call-modal__group-panel-content">
      <button class="call-modal__group-panel-copy" @click="handleCopyLink">
        <LinkIcon />
        <span>{{ copiedLabel }}</span>
      </button>

      <div class="call-modal__group-panel-members">
        <button
          v-for="member in members"
          :key="member.id"
          class="call-modal__group-panel-member"
          @click="handleOpenUserInfo(member)"
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
        <div class="call-modal__group-panel-title">
          <p>{{ title }}</p>
          <span>{{ meta }}</span>
        </div>
        <button class="call-modal__group-panel-close" @click="$emit('close')">
          <Icon :name="IconNameEnum.closeTag" :width="24" :height="24" />
        </button>
      </div>

      <div class="call-modal__group-panel-content">
        <button class="call-modal__group-panel-copy" @click="handleCopyLink">
          <LinkIcon />
          <span>{{ copiedLabel }}</span>
        </button>

        <div class="call-modal__group-panel-members">
          <button
            v-for="member in members"
            :key="member.id"
            class="call-modal__group-panel-member"
            @click="handleOpenUserInfo(member)"
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
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import LinkIcon from '../UI/LinkIcon.vue';
import MobileModal from '../UI/MobileModal.vue';
import type { IUser } from '../interfaces/interfaces';
import CachedAvatar from '../UI/CachedAvatar.vue';
import { Icon, IconNameEnum } from '@pksep/yui';
import { useUserInfoModal } from '../../composables/useUserInfoModal';

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
const { openUserInfo } = useUserInfoModal();

const isCopied = ref(false);
let copiedResetTimeout: ReturnType<typeof setTimeout> | null = null;

const copiedLabel = computed(() =>
  isCopied.value ? 'Скопировано' : 'Скопировать ссылку'
);

const resetCopiedState = () => {
  if (copiedResetTimeout) {
    clearTimeout(copiedResetTimeout);
    copiedResetTimeout = null;
  }

  isCopied.value = false;
};

const markCopied = () => {
  resetCopiedState();
  isCopied.value = true;
  copiedResetTimeout = setTimeout(() => {
    isCopied.value = false;
    copiedResetTimeout = null;
  }, 2000);
};

watch(
  () => props.open,
  isOpen => {
    if (!isOpen) {
      resetCopiedState();
    }
  }
);

onBeforeUnmount(() => {
  resetCopiedState();
});

const handleCopyLink = async () => {
  try {
    if (props.onCopyLink) {
      const result = await props.onCopyLink();
      if (result !== false) {
        markCopied();
      }
      return;
    }

    await navigator.clipboard.writeText(window.location.href);
    markCopied();
  } catch (error) {
    console.warn('Failed to copy group call link', error);
  }
};

const handleOpenUserInfo = (user?: IUser): void => {
  if (!user) {
    return;
  }

  openUserInfo(user);
};
</script>
