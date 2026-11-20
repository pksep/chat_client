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
      :href="showDownloads ? `#${dialogId}` : DESKTOP_APP_OPEN_URL"
      role="button"
      class="menu-native-app__open"
      :aria-label="actionLabel"
      :title="actionLabel"
      :aria-haspopup="showDownloads ? 'dialog' : undefined"
      :aria-expanded="showDownloads ? isOpen : undefined"
      :aria-controls="showDownloads ? dialogId : undefined"
      :data-testid="`${props.dataTestid}-DesktopApp-Action`"
      @click="handleAction"
      @keydown.space.prevent="trigger?.click()"
    >
      <Icon
        :name="showDownloads ? IconNameEnum.download : IconNameEnum.uploadCloud"
        :width="18"
        :height="18"
        aria-hidden="true"
      />
      <span v-if="!props.isCollapse">{{ actionLabel }}</span>
    </a>
    <Teleport to="body">
      <section
        v-if="isOpen"
        :id="dialogId"
        ref="panel"
        role="dialog"
        :aria-labelledby="`${dialogId}-title`"
        class="desktop-app-downloads"
        :style="floatingStyles"
        :data-testid="`${props.dataTestid}-DesktopApp-Downloads`"
        tabindex="-1"
      >
        <h3 :id="`${dialogId}-title`">Скачать СЭП Чат</h3>
        <p>
          Если приложение не открылось, установите СЭП Чат для своей системы.
        </p>
        <a
          v-for="item in downloads"
          :key="item.url"
          :href="item.url"
          target="_blank"
          rel="noopener noreferrer"
          @click="close"
        >
          <Icon
            :name="IconNameEnum.download"
            :width="16"
            :height="16"
            aria-hidden="true"
          />
          {{ item.label }}
        </a>
        <button
          type="button"
          class="desktop-app-downloads__close"
          @click="closeAndFocus"
        >
          Закрыть
        </button>
      </section>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { Capacitor } from '@capacitor/core';
import { isTauri } from '@tauri-apps/api/core';
import {
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  ref,
  useId,
  useTemplateRef
} from 'vue';
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/vue';
import { onClickOutside, onKeyStroke } from '@vueuse/core';
import { Icon, IconNameEnum } from '@pksep/yui';
import {
  DESKTOP_APP_OPEN_URL,
  desktopAppDownloadsFor,
  desktopBrowserPlatform
} from '../../utils/desktop-app-downloads';

const props = withDefaults(
  defineProps<{ isCollapse?: boolean; dataTestid?: string }>(),
  { isCollapse: false, dataTestid: 'Menu' }
);
const platform = desktopBrowserPlatform(navigator);
const isDesktopBrowser =
  !isTauri() && !Capacitor.isNativePlatform() && platform !== 'mobile';
const downloads = desktopAppDownloadsFor(platform);
const isOpen = ref(false);
const showDownloads = ref(false);
const actionLabel = computed(() =>
  showDownloads.value ? 'Скачать приложение' : 'Открыть приложение'
);
let launchTimer: ReturnType<typeof setTimeout> | undefined;
const clearLaunchTimer = () => {
  clearTimeout(launchTimer);
  launchTimer = undefined;
};
const dialogId = useId();
const trigger = useTemplateRef<HTMLAnchorElement>('trigger');
const panel = useTemplateRef<HTMLElement>('panel');
const { floatingStyles } = useFloating(trigger, panel, {
  placement: 'top-start',
  strategy: 'fixed',
  middleware: [offset(8), flip(), shift({ padding: 12 })],
  whileElementsMounted: autoUpdate
});
const close = () => {
  clearLaunchTimer();
  isOpen.value = false;
};
const closeAndFocus = () => {
  close();
  trigger.value?.focus({ preventScroll: true });
};
const toggle = async () => {
  isOpen.value = !isOpen.value;
  if (isOpen.value) {
    await nextTick();
    panel.value?.focus({ preventScroll: true });
  }
};
const handleAction = (event: MouseEvent) => {
  if (showDownloads.value) {
    event.preventDefault();
    void toggle();
    return;
  }
  clearLaunchTimer();
  // Браузер не раскрывает наличие обработчика протокола. Предлагаем загрузку,
  // если вкладка осталась активной; это не утверждение об отсутствии приложения.
  launchTimer = setTimeout(() => {
    launchTimer = undefined;
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
    showDownloads.value = true;
    void toggle();
  }, 2000);
};
const handleVisibility = () => {
  if (document.visibilityState === 'hidden') clearLaunchTimer();
};
onClickOutside(panel, close, { ignore: [trigger] });
onKeyStroke('Escape', event => {
  if (!isOpen.value) return;
  event.preventDefault();
  closeAndFocus();
});
const suppressPwaInstall = (event: Event) => event.preventDefault();
onMounted(() => {
  window.addEventListener('blur', clearLaunchTimer);
  document.addEventListener('visibilitychange', handleVisibility);
  if (isDesktopBrowser)
    window.addEventListener('beforeinstallprompt', suppressPwaInstall);
});
onBeforeUnmount(() => {
  clearLaunchTimer();
  window.removeEventListener('beforeinstallprompt', suppressPwaInstall);
  window.removeEventListener('blur', clearLaunchTimer);
  document.removeEventListener('visibilitychange', handleVisibility);
});
</script>

<style scoped>
.menu-native-app {
  display: grid;
  gap: 2px;
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
  border: 0;
  border-radius: 5px;
  background: var(--action-primary-bg);
  color: var(--text-on-brand);
  font: inherit;
  font-size: 14px;
  line-height: 18px;
  text-decoration: none;
  cursor: pointer;
}
.menu-native-app--collapse {
  width: 40px;
}
.menu-native-app__open:hover {
  filter: brightness(1.06);
}
.menu-native-app--collapse .menu-native-app__open {
  padding: 10px;
}
.desktop-app-downloads a:hover {
  background: var(--action-secondary-hover-bg);
}
.menu-native-app a:focus-visible,
.menu-native-app button:focus-visible,
.desktop-app-downloads a:focus-visible,
.desktop-app-downloads button:focus-visible {
  outline: 2px solid var(--text-link);
  outline-offset: 2px;
}
.desktop-app-downloads {
  z-index: 10001;
  box-sizing: border-box;
  width: min(260px, calc(100vw - 24px));
  max-height: calc(100dvh - 24px);
  overflow-y: auto;
  padding: 12px;
  border: 1px solid var(--border-table);
  border-radius: 12px;
  background: var(--surface-main-modal);
  color: var(--text-primary);
  box-shadow: 0 8px 32px rgb(0 0 0 / 15%);
  font-family: 'Inter Variable', sans-serif;
  font-size: 14px;
}
.desktop-app-downloads h3 {
  margin: 0 0 8px;
  font-size: 15px;
}
.desktop-app-downloads p {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-secondary);
}
.desktop-app-downloads a {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 8px;
  border-radius: 5px;
  color: var(--text-primary);
  text-decoration: none;
}
.desktop-app-downloads__close {
  width: 100%;
  min-height: 32px;
  margin-top: 8px;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
}
</style>
