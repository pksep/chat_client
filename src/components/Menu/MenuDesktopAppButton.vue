<template>
  <MenuDesktopAppVisibility
    v-if="isDesktopBrowser"
    @hide="clearLaunchAttempt"
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
  </MenuDesktopAppVisibility>
</template>

<script setup lang="ts">
import { Capacitor } from '@capacitor/core';
import { isTauri } from '@tauri-apps/api/core';
import { onBeforeUnmount, ref, useTemplateRef } from 'vue';
import { onClickOutside, onKeyStroke } from '@vueuse/core';
import { Icon, IconNameEnum } from '@pksep/yui';
import MenuDesktopAppVisibility from './MenuDesktopAppVisibility.vue';
import {
  DESKTOP_APP_OPEN_URL,
  DESKTOP_APP_DOWNLOAD_PAGE_URL,
  desktopBrowserPlatform
} from '../../utils/desktop-app-downloads';
import { launchNativeApp } from '../../utils/native-app-launch';

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
let launchAttemptActive = false;
let cancelLaunch: (() => void) | undefined;
const clearLaunchAttempt = () => {
  cancelLaunch?.();
  cancelLaunch = undefined;
  launchPending.value = false;
  launchAttemptActive = false;
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
const handleAction = (event: MouseEvent) => {
  if (launchPending.value) {
    event.preventDefault();
    return;
  }
  clearLaunchAttempt();
  launchAttemptActive = true;
  launchPending.value = true;
  cancelLaunch = launchNativeApp(DESKTOP_APP_OPEN_URL, {
    navigate: false,
    onFallback: () => {
      clearLaunchAttempt();
      openDownloadWebsite();
    },
    onOpened: clearLaunchAttempt,
    onBlur: () => {
      launchPending.value = false;
    }
  });
};
onClickOutside(trigger, clearLaunchAttempt);
onKeyStroke('Escape', () => {
  if (launchAttemptActive) clearLaunchAttempt();
});
onBeforeUnmount(clearLaunchAttempt);
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
