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
        обмена сохраняется между запусками.
      </p>
      <div class="menu-profile__wallpapers-actions">
        <Button
          :type="ButtonTypeEnum.secondary"
          :size="SizesEnum.small"
          :data-testid="`${props.dataTestid}-ResetButton`"
          @click="reset"
        >
          Запросить разрешения заново
        </Button>
      </div>
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
import { resetDesktopPermissionChoices } from '../../services/desktop-permission-preferences';

const props = withDefaults(defineProps<{ dataTestid?: string }>(), {
  dataTestid: 'DesktopPermissions'
});
const open = ref(false);
const message = ref('');
const reset = () => {
  message.value = resetDesktopPermissionChoices()
    ? 'Ответы сброшены. При следующем запуске приложение снова запросит доступ по мере необходимости. Системные разрешения не изменены.'
    : 'Не удалось сбросить ответы. Повторите попытку.';
};
</script>
