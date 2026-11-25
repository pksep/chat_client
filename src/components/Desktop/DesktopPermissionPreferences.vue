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
      <p class="desktop-permissions__caption">Доступ в СЭП Чате</p>
      <ul class="desktop-permissions__list" aria-label="Разрешения СЭП Чата">
        <li
          v-for="permission in permissionRows"
          :key="permission.id"
          class="desktop-permissions__row"
        >
          <button
            type="button"
            class="desktop-permissions__control"
            role="switch"
            :aria-label="permission.label"
            :aria-checked="permission.granted"
            :disabled="changing !== null"
            :aria-description="
              permission.id === 'screen-capture'
                ? 'Источник демонстрации выбирается каждый раз'
                : permission.status
            "
            @click="togglePermission(permission.id)"
          >
            <span class="desktop-permissions__label">{{
              permission.label
            }}</span>
            <span
              class="desktop-permissions__status"
              :class="{
                'desktop-permissions__status--granted': permission.granted
              }"
              >{{ permission.status }}</span
            >
            <span
              class="desktop-permissions__switch"
              :class="{ 'desktop-permissions__switch--on': permission.granted }"
              aria-hidden="true"
              ><span
            /></span>
          </button>
        </li>
      </ul>
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
import { computed, ref } from 'vue';
import { Icon, IconNameEnum } from '@pksep/yui';
import {
  desktopPermissionStorageWarning,
  getDesktopPermissionChoice,
  saveDesktopPermissionChoice,
  type DesktopPermission
} from '../../services/desktop-permission-preferences';
import {
  desktopNotificationsBlocked,
  desktopNotificationCheckFailed,
  ensureDesktopNotificationPermission
} from '../../services/desktop-notification-permissions';

const props = withDefaults(defineProps<{ dataTestid?: string }>(), {
  dataTestid: 'DesktopPermissions'
});
const open = ref(false);
const message = ref('');
const changing = ref<DesktopPermission | null>(null);
const permissionRows = computed(() => {
  const rows = (
    [
      ['microphone', 'Микрофон'],
      ['camera', 'Камера'],
      ['geolocation', 'Геолокация'],
      ['notifications', 'Уведомления'],
      ['clipboard-read', 'Буфер обмена'],
      ['screen-capture', 'Демонстрация экрана']
    ] as const
  ).map(([id, label]) => {
    const choice = getDesktopPermissionChoice(id);
    const blocked = id === 'notifications' && desktopNotificationsBlocked.value;
    return {
      id,
      label,
      granted: choice === 'granted' && !blocked,
      status: blocked
        ? 'Отключено в системе'
        : choice === 'granted'
          ? 'Разрешено'
          : choice === 'denied'
            ? 'Не разрешено'
            : choice === 'requested'
              ? 'Нужен доступ'
              : 'Не запрошено'
    };
  });
  return rows;
});
const togglePermission = async (
  permission: DesktopPermission
): Promise<void> => {
  if (changing.value) return;
  changing.value = permission;
  message.value = '';
  try {
    const allowed = getDesktopPermissionChoice(permission) !== 'granted';
    if (permission === 'notifications' && allowed) {
      if (!(await ensureDesktopNotificationPermission({ interactive: true })))
        message.value =
          'Разрешите уведомления СЭП Чата в настройках компьютера.';
    } else {
      await saveDesktopPermissionChoice(
        permission,
        allowed ? 'granted' : 'denied'
      );
    }
  } catch {
    message.value = 'Не удалось изменить разрешение. Повторите попытку.';
  } finally {
    changing.value = null;
  }
};
</script>

<style scoped>
.desktop-permissions__list {
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}
.desktop-permissions__caption {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 18px;
}
.desktop-permissions__row {
  border-bottom: 1px solid var(--border-table);
}
.desktop-permissions__control {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
  border: 0;
  background: transparent;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  font-size: 12px;
  line-height: 18px;
}
.desktop-permissions__label {
  flex: 1;
  color: var(--text-primary);
}
.desktop-permissions__status {
  max-width: 55%;
  color: var(--text-secondary);
  text-align: right;
}
.desktop-permissions__control:focus-visible {
  outline: 2px solid var(--text-link);
  outline-offset: 2px;
  border-radius: 4px;
}
.desktop-permissions__switch {
  flex: 0 0 26px;
  width: 26px;
  height: 16px;
  padding: 3px;
  box-sizing: border-box;
  border-radius: 10px;
  background: var(--border-table);
}
.desktop-permissions__switch > span {
  display: block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--white, #fff);
  transition: transform 150ms ease;
}
.desktop-permissions__switch--on {
  background: var(--action-primary-bg);
}
.desktop-permissions__switch--on > span {
  transform: translateX(10px);
}
.desktop-permissions__status--granted {
  color: var(--text-link);
}
</style>
