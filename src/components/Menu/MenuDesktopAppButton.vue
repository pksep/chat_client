<template>
  <div
    v-if="isDesktopBrowser"
    :class="[
      'menu-native-app',
      { 'menu-native-app--collapse': props.isCollapse }
    ]"
    :data-testid="`${props.dataTestid}-DesktopApp`"
  >
    <a
      ref="trigger"
      :href="DESKTOP_APP_OPEN_URL"
      role="button"
      class="menu-native-app__open"
      aria-label="Открыть приложение"
      :title="launchPending ? 'Открываем приложение…' : 'Открыть приложение'"
      :aria-busy="launchPending"
      :aria-disabled="launchPending"
      :data-testid="`${props.dataTestid}-DesktopApp-Action`"
      @click="handleAction"
      @keydown.space.prevent="trigger?.click()"
    >
      <Icon
        v-if="!launchPending"
        :name="IconNameEnum.uploadCloud"
        :width="18"
        :height="18"
        aria-hidden="true"
      />
      <span v-else class="menu-native-app__spinner" aria-hidden="true" />
      <span
        :class="{ 'menu-native-app__status--collapsed': props.isCollapse }"
        role="status"
        aria-live="polite"
        >{{
          launchPending ? 'Открываем приложение…' : 'Открыть приложение'
        }}</span
      >
    </a>
  </div>
</template>

<script setup lang="ts">
import { Capacitor } from '@capacitor/core';
import { isTauri } from '@tauri-apps/api/core';
import { onMounted, onBeforeUnmount, ref, useTemplateRef } from 'vue';
import { onClickOutside, onKeyStroke } from '@vueuse/core';
import { Icon, IconNameEnum } from '@pksep/yui';
import {
  DESKTOP_APP_OPEN_URL,
  DESKTOP_APP_DOWNLOAD_PAGE_URL,
  desktopBrowserPlatform
} from '../../utils/desktop-app-downloads';

const props = withDefaults(
  defineProps<{ isCollapse?: boolean; dataTestid?: string }>(),
  { isCollapse: false, dataTestid: 'Menu' }
);
const isDesktopBrowser =
  !isTauri() &&
  !Capacitor.isNativePlatform() &&
  desktopBrowserPlatform(navigator) !== 'mobile';
const trigger = useTemplateRef<HTMLAnchorElement>('trigger');
const launchPending = ref(false);
let launchTimer: ReturnType<typeof setTimeout> | undefined;
const clearLaunchAttempt = () => {
  clearTimeout(launchTimer);
  launchTimer = undefined;
  launchPending.value = false;
};
const openDownloadWebsite = () => {
  const link = document.createElement('a');
  link.href = DESKTOP_APP_DOWNLOAD_PAGE_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
};
const finishLaunchAttempt = () => {
  launchTimer = undefined;
  // Браузер не раскрывает наличие Tauri: продолжаем переход, если вкладка активна.
  if (
    !launchPending.value ||
    document.visibilityState !== 'visible' ||
    !document.hasFocus()
  )
    return;
  clearLaunchAttempt();
  openDownloadWebsite();
};
const handleAction = (event: MouseEvent) => {
  if (launchPending.value) {
    event.preventDefault();
    return;
  }
  launchPending.value = true;
  launchTimer = setTimeout(finishLaunchAttempt, 2000);
};
const handleFocus = () => {
  // Системное окно об отсутствии обработчика тоже забирает фокус.
  // После его закрытия продолжаем переход на страницу загрузки.
  if (launchPending.value && launchTimer === undefined)
    launchTimer = setTimeout(finishLaunchAttempt, 300);
};
const handleVisibility = () => {
  if (document.visibilityState === 'hidden') clearLaunchAttempt();
};
onClickOutside(trigger, clearLaunchAttempt);
onKeyStroke('Escape', () => {
  if (launchPending.value) clearLaunchAttempt();
});
onMounted(() => {
  window.addEventListener('focus', handleFocus);
  document.addEventListener('visibilitychange', handleVisibility);
});
onBeforeUnmount(() => {
  clearLaunchAttempt();
  window.removeEventListener('focus', handleFocus);
  document.removeEventListener('visibilitychange', handleVisibility);
});
</script>

<style scoped>
.menu-native-app {
  display: grid;
  min-width: 0;
  padding: 6px 0;
}
.menu-native-app__open {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-sizing: border-box;
  width: 100%;
  min-height: 40px;
  padding: 10px 12px;
  border-radius: 5px;
  background: var(--action-primary-bg);
  color: var(--text-on-brand);
  font-family: inherit;
  font-size: 14px;
  line-height: 18px;
  text-decoration: none;
  cursor: pointer;
}
.menu-native-app__open:hover {
  filter: brightness(1.06);
}
.menu-native-app__open:focus-visible {
  outline: 2px solid var(--text-link);
  outline-offset: 2px;
}
.menu-native-app__open[aria-busy='true'] {
  cursor: progress;
}
.menu-native-app__spinner {
  box-sizing: border-box;
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: native-app-spin 800ms linear infinite;
}
.menu-native-app__status--collapsed {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.menu-native-app--collapse {
  width: 40px;
}
.menu-native-app--collapse .menu-native-app__open {
  padding: 10px;
}
@keyframes native-app-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .menu-native-app__spinner {
    animation: none;
  }
}
</style>
