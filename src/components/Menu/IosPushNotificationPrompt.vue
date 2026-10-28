<template>
  <MobileModal
    v-if="isPromptOpen"
    :open="isPromptOpen && !installOpen"
    class="mobile-modal ios-push-modal"
    header-class="hidden"
    :show-divider="false"
    @unmount-close="dismissed = true"
  >
    <section
      class="ios-push-prompt"
      data-testid="IosPushNotificationPrompt"
      aria-label="Уведомления на iPhone"
    >
      <h2>Включить уведомления чата</h2>
      <p aria-live="polite">{{ description }}</p>
      <div class="ios-push-prompt__actions">
        <Button
          v-if="canEnable || status === 'install'"
          :type="ButtonTypeEnum.primary"
          :size="SizesEnum.medium"
          @click="handleAction"
        >
          {{ status === 'install' ? 'Как установить' : 'Включить' }}
        </Button>
        <Button
          :type="ButtonTypeEnum.secondary"
          :size="SizesEnum.medium"
          @click="dismissed = true"
        >
          Настроить позже
        </Button>
      </div>
    </section>
  </MobileModal>
  <IosInstallPromptModal :open="installOpen" @close="installOpen = false" />
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { Button, ButtonTypeEnum, SizesEnum } from '@pksep/yui';
import { isIosWeb } from '../../utils/ios-pwa-viewport';
import {
  refreshWebPushAvailability,
  webPushStatus as status
} from '../../services/web-push-status';
import { requestWebPushNotifications } from '../../services/usePushNotifications';
import IosInstallPromptModal from './IosInstallPromptModal.vue';
import MobileModal from '../UI/MobileModal.vue';

const isIos = isIosWeb();
const props = withDefaults(defineProps<{ active?: boolean }>(), {
  active: true
});
const dismissed = ref(false);
const installOpen = ref(false);
const enablingFromPrompt = ref(false);
watch(status, value => {
  if (value === 'subscribed') enablingFromPrompt.value = false;
});
const isPromptOpen = computed(
  () =>
    isIos &&
    props.active &&
    !dismissed.value &&
    (!['registering', 'error'].includes(status.value) ||
      enablingFromPrompt.value ||
      (status.value === 'error' &&
        globalThis.Notification?.permission !== 'granted')) &&
    !['idle', 'subscribed'].includes(status.value)
);
const canEnable = computed(() => ['prompt', 'error'].includes(status.value));
const description = computed(() => {
  switch (status.value) {
    case 'install':
      return 'Добавьте чат на экран «Домой» и откройте его оттуда, чтобы получать уведомления.';
    case 'unsupported':
      return 'Для уведомлений нужна iOS 16.4 или новее. Откройте чат с экрана «Домой».';
    case 'denied':
      return 'Разрешите уведомления для SEP:Chat в настройках iPhone → Уведомления.';
    case 'registering':
      return 'Включаем уведомления…';
    case 'error':
      return 'Не удалось включить уведомления. Проверьте соединение и попробуйте ещё раз.';
    default:
      return 'Получайте уведомления о новых сообщениях, даже когда чат свёрнут или закрыт';
  }
});

const handleAction = (): void => {
  if (status.value === 'install') installOpen.value = true;
  else {
    enablingFromPrompt.value = true;
    void requestWebPushNotifications();
  }
};
const refresh = (): void => {
  if (isIos && document.visibilityState === 'visible')
    refreshWebPushAvailability();
};
onMounted(() => {
  refresh();
  document.addEventListener('visibilitychange', refresh);
});
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', refresh);
});
</script>

<style scoped>
.ios-push-prompt {
  display: grid;
  gap: 10px;
  padding: 30px 15px;
  color: var(--text-primary);
  text-align: center;
}
.ios-push-prompt h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 24px;
}
.ios-push-prompt p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 700;
  line-height: 17px;
}
.ios-push-prompt__actions {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}
</style>

<style>
dialog.mobile__modal.mobile-modal.ios-push-modal {
  box-sizing: border-box;
  width: 100dvw;
  max-width: 100dvw;
  height: auto !important;
  border: 0 !important;
  border-radius: 15px 15px 0 0;
}
.ios-push-modal .modal-yui-kit__modal-content {
  width: 100%;
  padding: 0;
}
.ios-push-modal button.button-yui-kit {
  width: 100%;
  min-height: 50px;
  margin-top: 0;
  font-size: 20px;
  font-weight: 400;
  line-height: 24px;
}
</style>
