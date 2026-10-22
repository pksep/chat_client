<template>
  <section
    v-if="isIos && !dismissed && status !== 'idle' && status !== 'subscribed'"
    class="ios-push-prompt"
    aria-label="Уведомления на iPhone"
    data-testid="IosPushNotificationPrompt"
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
      <button class="ios-push-prompt__later" @click="dismissed = true">
        Позже
      </button>
    </div>
  </section>
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

const isIos = isIosWeb();
const dismissed = ref(false);
const installOpen = ref(false);
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
  flex-shrink: 0;
  display: grid;
  gap: 8px;
  margin: 8px 12px;
  padding: 12px;
  border-radius: 12px;
  background: var(--surface-input-secondary);
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.4;
}
.ios-push-prompt p {
  margin: 0;
  color: var(--text-secondary);
}
.ios-push-prompt__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ios-push-prompt__later {
  border: 0;
  background: transparent;
  padding: 8px;
  color: var(--text-secondary);
  cursor: pointer;
}
</style>
