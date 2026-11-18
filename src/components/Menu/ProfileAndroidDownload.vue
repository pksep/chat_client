<template>
  <span class="profile-android-control">
    <button
      ref="trigger"
      type="button"
      class="menu-profile__row profile-android__trigger"
      aria-haspopup="dialog"
      :aria-expanded="isOpen"
      :aria-controls="dialogId"
      :data-testid="`${props.dataTestid}-Trigger`"
      @click="toggle"
    >
      <Icon :name="IconNameEnum.android" :width="20" :height="20" />
      <span>Скачать Android-приложение</span>
    </button>

    <Teleport to="body">
      <section
        v-if="isOpen"
        :id="dialogId"
        ref="popover"
        role="dialog"
        :aria-labelledby="`${dialogId}-title`"
        :aria-busy="isLoading"
        :data-testid="`${props.dataTestid}-Popover`"
        class="profile-android"
        tabindex="-1"
      >
        <div class="profile-android__code">
          <img
            v-if="download && !imageFailed"
            :src="download.qrImageUrl"
            width="232"
            height="232"
            alt="QR-код для скачивания SEP Chat на Android"
            crossorigin="anonymous"
            referrerpolicy="no-referrer"
            @error="imageFailed = true"
          />
          <p v-else-if="isLoading" role="status">Загружаем QR-код...</p>
          <div v-else class="profile-android__error">
            <p role="alert">Не удалось загрузить QR-код.</p>
            <button type="button" @click="load">Попробовать снова</button>
          </div>
        </div>
        <h3 :id="`${dialogId}-title`">SEP Chat для Android</h3>
        <p class="profile-android__description">
          Отсканируйте QR-код камерой телефона, чтобы скачать последнюю APK.
        </p>
        <a
          v-if="download"
          :href="download.apkUrl"
          class="profile-android__download"
          target="_blank"
          rel="noopener noreferrer"
        >
          Скачать APK
        </a>
        <button
          type="button"
          class="profile-android__close"
          @click="closeAndFocus"
        >
          Закрыть
        </button>
      </section>
    </Teleport>
  </span>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, useTemplateRef } from 'vue';
import { onClickOutside, onKeyStroke } from '@vueuse/core';
import { Icon, IconNameEnum } from '@pksep/yui';
import {
  loadAndroidDownload,
  type AndroidDownload
} from '../../services/android-download';
import {
  BackButtonPriority,
  useBackButtonHandler
} from '../../composables/useBackButton';

const props = withDefaults(defineProps<{ dataTestid?: string }>(), {
  dataTestid: 'ProfileAndroidDownload'
});
const dialogId = useId();
const trigger = useTemplateRef<HTMLButtonElement>('trigger');
const popover = useTemplateRef<HTMLElement>('popover');
const isOpen = ref(false);
const isLoading = ref(false);
const imageFailed = ref(false);
const download = ref<AndroidDownload | null>(null);
let request: AbortController | undefined;

const close = () => {
  isOpen.value = false;
  request?.abort();
  request = undefined;
  download.value = null;
  isLoading.value = false;
};

const load = async () => {
  request?.abort();
  const current = new AbortController();
  request = current;
  const timeout = setTimeout(() => current.abort(), 10_000);
  download.value = null;
  imageFailed.value = false;
  isLoading.value = true;
  try {
    const value = await loadAndroidDownload(current.signal);
    if (request === current && isOpen.value) download.value = value;
  } catch {
    // Публичная конфигурация не получает сессию; сырые сетевые ошибки не показываем.
  } finally {
    clearTimeout(timeout);
    if (request === current) isLoading.value = false;
  }
};

const toggle = async () => {
  if (isOpen.value) return close();
  isOpen.value = true;
  void load();
  await nextTick();
  popover.value?.focus({ preventScroll: true });
};

const closeAndFocus = () => {
  close();
  trigger.value?.focus({ preventScroll: true });
};

onClickOutside(popover, close, { ignore: [trigger] });
onKeyStroke('Escape', event => {
  if (!isOpen.value) return;
  event.preventDefault();
  closeAndFocus();
});
useBackButtonHandler(isOpen, closeAndFocus, BackButtonPriority.overlay);
onBeforeUnmount(close);
</script>

<style scoped>
.profile-android-control {
  display: flex;
  min-width: 0;
}

.profile-android__trigger {
  width: 100%;
  height: auto;
  min-height: 44px;
  gap: 10px;
  margin: 0;
  border: 0;
  color: var(--text-primary);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.profile-android__trigger :deep(svg) {
  flex-shrink: 0;
}

.profile-android__trigger:focus-visible {
  outline: 2px solid var(--text-link);
  outline-offset: 2px;
}

@media (hover: hover) {
  .profile-android__trigger:hover {
    background: var(--action-secondary-hover-bg);
  }
}

.profile-android {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1000;
  box-sizing: border-box;
  width: min(280px, calc(100vw - 24px));
  max-height: calc(100dvh - 24px);
  overflow-y: auto;
  padding: 20px 16px;
  border: 1px solid var(--border-table);
  border-radius: 16px;
  background: var(--surface-main-modal);
  color: var(--text-primary);
  box-shadow: 0 8px 32px rgb(0 0 0 / 15%);
  text-align: center;
  font-family: 'Inter Variable', sans-serif;
  font-size: 14px;
}

.profile-android__code {
  display: grid;
  place-items: center;
  min-height: 232px;
}

.profile-android__code img {
  display: block;
  width: min(232px, 100%);
  height: auto;
}

.profile-android h3 {
  margin: 16px 0 8px;
  font-size: 16px;
  font-weight: 700;
}

.profile-android__description {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.4;
}

.profile-android__download,
.profile-android__close {
  display: block;
  width: 100%;
  margin-top: 12px;
  padding: 10px;
  border: 0;
  border-radius: 5px;
  font: inherit;
  cursor: pointer;
}

.profile-android__download {
  box-sizing: border-box;
  border: 1px solid var(--border-table);
  background: var(--action-secondary-bg, transparent);
  color: var(--text-link);
  text-decoration: none;
}

.profile-android__close {
  background: transparent;
  color: var(--text-primary);
}
</style>
