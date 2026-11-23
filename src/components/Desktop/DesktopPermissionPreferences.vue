<template>
  <div
    class="menu-profile__wallpapers"
    :data-testid="`${props.dataTestid}-Container`"
  >
    <button
      class="menu-profile__wallpapers-trigger"
      type="button"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="menu-profile__wallpapers-trigger-title"
        >Разрешения устройств</span
      >
      <Icon
        :name="open ? IconNameEnum.chevronUp : IconNameEnum.chevronDown"
        :width="24"
        :height="16"
      />
    </button>
    <div v-if="open" class="menu-profile__wallpapers-menu">
      <p class="menu-profile__update-description">
        Выбор доступа к микрофону, камере, геолокации, уведомлениям и буферу
        обмена сохраняется между запусками и обновлениями. Экран или окно для
        демонстрации выбирается каждый раз отдельно.
      </p>
      <p
        v-if="desktopNotificationsBlocked"
        role="status"
        class="menu-profile__update-description"
      >
        Уведомления отключены в системе. Разрешите уведомления и баннеры для СЭП
        Чат в настройках уведомлений компьютера.
      </p>
      <p
        v-else-if="desktopNotificationCheckFailed"
        role="status"
        class="menu-profile__update-description"
      >
        Не удалось проверить системный доступ к уведомлениям. Если баннеров нет,
        проверьте настройки уведомлений компьютера.
      </p>
      <div class="menu-profile__wallpapers-actions">
        <Button
          :type="ButtonTypeEnum.secondary"
          :size="SizesEnum.small"
          :data-testid="`${props.dataTestid}-ResetButton`"
          :disabled="resetting"
          @click="reset"
        >
          Запросить разрешения заново
        </Button>
      </div>
      <p
        v-if="desktopPermissionStorageWarning"
        role="alert"
        class="menu-profile__update-description"
      >
        {{ desktopPermissionStorageWarning }}
      </p>
      <p v-if="message" role="status" class="menu-profile__update-description">
        {{ message }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';
import {
  desktopPermissionStorageWarning,
  resetDesktopPermissionChoices
} from '../../services/desktop-permission-preferences';
import {
  desktopNotificationsBlocked,
  desktopNotificationCheckFailed
} from '../../services/desktop-notification-permissions';

const props = withDefaults(defineProps<{ dataTestid?: string }>(), {
  dataTestid: 'DesktopPermissions'
});
const open = ref(false);
const message = ref('');
const resetting = ref(false);
const reset = async () => {
  resetting.value = true;
  message.value = (await resetDesktopPermissionChoices())
    ? 'Ответы сброшены. При следующем запуске приложение снова запросит доступ по мере необходимости. Системные разрешения не изменены.'
    : 'Не удалось сбросить ответы. Повторите попытку.';
  resetting.value = false;
};
</script>
