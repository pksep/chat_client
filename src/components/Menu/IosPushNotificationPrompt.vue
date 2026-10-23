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
      <strong>Уведомления о сообщениях</strong>
      <p aria-live="polite">{{ description }}</p>
      <div class="ios-push-prompt__actions">
        <Button
          v-if="canEnable || status === 'install'"
          :type="ButtonTypeEnum.primary"
          :size="SizesEnum.small"
          @click="handleAction"
        >
          {{ status === 'install' ? 'Как установить' : 'Включить' }}
        </Button>
        <Button :type="ButtonTypeEnum.secondary" @click="dismissed = true">
          Позже
        </Button>
      </div>
    </section>
  </MobileModal>
  <IosInstallPromptModal :open="installOpen" @close="installOpen = false" />
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
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
const isPromptOpen = computed(
  () =>
    isIos &&
    props.active &&
    !dismissed.value &&
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
      return 'Получайте новые сообщения, даже когда чат свёрнут или закрыт.';
  }
});

const handleAction = (): void => {
  if (status.value === 'install') installOpen.value = true;
  else void requestWebPushNotifications();
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
  gap: 12px;
  padding: 10px;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.4;
}
.ios-push-prompt p {
  margin: 0;
  color: var(--text-secondary);
}
.ios-push-prompt__actions {
  display: grid;
  gap: 10px;
}
</style>

<style>
dialog.mobile-modal.ios-push-modal {
  height: auto !important;
}
.ios-push-modal .modal-yui-kit__modal-content {
  padding: 10px;
}
.ios-push-modal button.button-yui-kit {
  margin-top: 0;
}
</style>
