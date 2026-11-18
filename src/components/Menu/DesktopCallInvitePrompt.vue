<template>
  <Teleport to="body">
    <div v-if="pendingDesktopCallInvite" class="desktop-call-invite">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="desktop-call-invite-title"
        class="desktop-call-invite__dialog"
        data-testid="DesktopCallInvitePrompt"
      >
        <h2 id="desktop-call-invite-title">Открыть звонок в СЭП Чат?</h2>
        <p>В приложении удобнее звонить и получать уведомления.</p>
        <a :href="pendingDesktopCallInvite" class="desktop-call-invite__open">
          Открыть СЭП Чат
        </a>
        <button type="button" @click="continueCallInviteInBrowser">
          Продолжить в браузере
        </button>
        <a
          href="https://github.com/pksep/chat_client/releases/latest"
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
import {
  continueCallInviteInBrowser,
  pendingDesktopCallInvite
} from '../../services/useDesktopCallLinks';
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
  display: grid;
  gap: 16px;
  width: min(420px, 100%);
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
