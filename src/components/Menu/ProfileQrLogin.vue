<template>
  <span class="profile-qr-login-control">
    <button
      ref="trigger"
      type="button"
      class="profile-qr-login__trigger"
      aria-label="Вход по QR-коду"
      title="Вход по QR-коду"
      aria-haspopup="dialog"
      :aria-expanded="isOpen"
      :aria-controls="dialogId"
      :data-testid="`${props.dataTestid}-Trigger`"
      @click="toggle"
    >
      <Icon :name="IconNameEnum.qrCode" :width="20" :height="20" />
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
        class="profile-qr-login"
        tabindex="-1"
      >
        <div class="profile-qr-login__code">
          <img
            v-if="image"
            :src="image"
            width="232"
            height="232"
            alt="QR-код для входа в чат"
            :data-testid="`${props.dataTestid}-Code`"
          />
          <p v-else-if="isLoading" role="status">Создаём QR-код...</p>
          <div v-else class="profile-qr-login__message">
            <p role="alert">{{ error }}</p>
            <Button :size="SizesEnum.small" @click="generate">
              Попробовать снова
            </Button>
          </div>
        </div>
        <h3 :id="`${dialogId}-title`" class="profile-qr-login__title">
          Вход по QR-коду
        </h3>
        <p class="profile-qr-login__description">
          Отсканируйте QR-код камерой телефона — чат откроется автоматически!
        </p>
      </section>
    </Teleport>
  </span>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, useTemplateRef } from 'vue';
import { onClickOutside, onKeyStroke, useEventListener } from '@vueuse/core';
import { Button, Icon, IconNameEnum, SizesEnum } from '@pksep/yui';
import {
  createQrLogin,
  QR_LOGIN_REFRESH_LEAD_MS
} from '../../services/qr-login';
import {
  BackButtonPriority,
  useBackButtonHandler
} from '../../composables/useBackButton';

const props = withDefaults(defineProps<{ dataTestid?: string }>(), {
  dataTestid: 'ProfileQrLogin'
});
const dialogId = useId();
const trigger = useTemplateRef<HTMLButtonElement>('trigger');
const popover = useTemplateRef<HTMLElement>('popover');
const isOpen = ref(false);
const isLoading = ref(false);
const image = ref('');
const error = ref('');
let generation = 0;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let expiresAt = 0;

const clear = () => {
  generation++;
  clearTimeout(refreshTimer);
  refreshTimer = undefined;
  expiresAt = 0;
  image.value = '';
  error.value = '';
  isLoading.value = false;
};

const close = () => {
  isOpen.value = false;
  clear();
};

const generate = async () => {
  clear();
  const currentGeneration = generation;
  isLoading.value = true;
  try {
    const [qr, { toDataURL }] = await Promise.all([
      createQrLogin(),
      import('qrcode')
    ]);
    const dataUrl = await toDataURL(qr.url, {
      scale: 6,
      margin: 4,
      errorCorrectionLevel: 'L'
    });
    // Закрытый или повторно открытый попап не принимает прежний ответ.
    if (generation !== currentGeneration) return;
    const refreshIn = qr.expiresAt - Date.now() - QR_LOGIN_REFRESH_LEAD_MS;
    if (refreshIn <= 0) throw new Error('QR-код истёк');
    image.value = dataUrl;
    expiresAt = qr.expiresAt;
    refreshTimer = setTimeout(() => void generate(), refreshIn);
  } catch {
    if (generation === currentGeneration) {
      error.value = 'Не удалось создать QR-код. Попробуйте ещё раз.';
    }
  } finally {
    if (generation === currentGeneration) isLoading.value = false;
  }
};

const toggle = async () => {
  if (isOpen.value) return close();
  isOpen.value = true;
  void generate();
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
useEventListener(document, 'visibilitychange', () => {
  // После сна устройства таймер мог ещё не сработать.
  if (
    document.visibilityState === 'visible' &&
    isOpen.value &&
    expiresAt &&
    expiresAt <= Date.now() + QR_LOGIN_REFRESH_LEAD_MS
  ) {
    void generate();
  }
});
onBeforeUnmount(clear);
</script>

<style scoped>
.profile-qr-login-control {
  display: inline-flex;
  flex-shrink: 0;
  margin-right: auto;
}

.menu-section-heading--waiting > .profile-qr-login-control {
  margin-left: auto;
  margin-right: 0;
}

.profile-qr-login__trigger {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  vertical-align: middle;
  width: 24px;
  height: 24px;
  padding: 0;
  margin: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-link);
  cursor: pointer;
}

.profile-qr-login {
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
  font-weight: 400;
}

.profile-qr-login__code {
  display: grid;
  place-items: center;
  width: 100%;
  min-height: 232px;
}

.profile-qr-login__code img {
  display: block;
  width: min(232px, 100%);
  height: auto;
}

.profile-qr-login__message {
  display: grid;
  justify-items: center;
  gap: 16px;
}

.profile-qr-login__message p {
  margin: 0;
}

.profile-qr-login__title {
  margin: 16px 0 8px;
  font-size: 16px;
  font-weight: 700;
}

.profile-qr-login__description {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.3;
}
</style>
