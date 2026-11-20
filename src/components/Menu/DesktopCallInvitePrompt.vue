<template>
  <Teleport to="body">
    <div v-if="pendingDesktopCallInvite" class="desktop-call-invite">
      <section
        ref="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="desktop-call-invite-title"
        class="desktop-call-invite__dialog"
        data-testid="DesktopCallInvitePrompt"
        tabindex="-1"
      >
        <h2 id="desktop-call-invite-title">Открыть звонок в СЭП Чат?</h2>
        <p>В приложении удобнее звонить и получать уведомления.</p>
        <a :href="pendingDesktopCallInvite" class="desktop-call-invite__open">
          Продолжить в приложении
        </a>
        <button type="button" @click="continueCallInviteInBrowser">
          Остаться в браузере
        </button>
        <a
          :href="callInviteApplicationDownloadUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="desktop-call-invite__download"
        >
          Скачать приложение
        </a>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, watch, useTemplateRef } from 'vue';
import { onKeyStroke } from '@vueuse/core';
import {
  callInviteApplicationDownloadUrl,
  continueCallInviteInBrowser,
  pendingDesktopCallInvite
} from '../../services/useDesktopCallLinks';

const dialog = useTemplateRef<HTMLElement>('dialog');
watch(
  pendingDesktopCallInvite,
  async value => {
    if (!value) return;
    await nextTick();
    dialog.value?.focus({ preventScroll: true });
  },
  { immediate: true }
);
onKeyStroke('Tab', event => {
  const element = dialog.value;
  if (!pendingDesktopCallInvite.value || !element) return;
  const focusable = Array.from(
    element.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === element)
  ) {
    event.preventDefault();
    last?.focus();
  } else if (
    !event.shiftKey &&
    (document.activeElement === last ||
      !element.contains(document.activeElement))
  ) {
    event.preventDefault();
    first?.focus();
  }
});
</script>

<style scoped>
.desktop-call-invite {
  position: fixed;
  inset: 0;
  z-index: 100001;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(0 0 0 / 45%);
}
.desktop-call-invite__dialog {
  box-sizing: border-box;
  display: grid;
  gap: 16px;
  width: min(420px, 100%);
  min-width: 0;
  max-height: calc(100dvh - 48px);
  overflow-y: auto;
  padding: 28px;
  border-radius: 16px;
  color: var(--text-primary);
  background: var(--surface-main-modal, #fff);
  box-shadow: 0 16px 48px rgb(0 0 0 / 20%);
}
h2,
p {
  margin: 0;
}
h2 {
  font-size: 22px;
}
p {
  color: var(--text-secondary);
  line-height: 1.5;
}
a,
button {
  text-align: center;
  font: inherit;
}
button,
.desktop-call-invite__open {
  padding: 12px 16px;
  border: 1px solid var(--border-primary, #d9dce1);
  border-radius: 8px;
  cursor: pointer;
  text-decoration: none;
}
button {
  background: transparent;
  color: inherit;
}
.desktop-call-invite__open {
  background: #2675ed;
  border-color: #2675ed;
  color: #fff;
}
.desktop-call-invite__download {
  color: var(--text-secondary);
  font-size: 14px;
}
</style>
