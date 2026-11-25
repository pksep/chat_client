<template>
  <section class="client-widget-settings" aria-label="Настройки виджета">
    <MenuSectionHeading class="chats-toolbar__headline">
      <h4 class="chats-toolbar__title">Настройки</h4>
      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        aria-label="Назад к клиентам"
        @click="closePanel"
      >
        <Icon :name="IconNameEnum.arrowLeft" :width="24" :height="24" />
      </Button>
    </MenuSectionHeading>

    <div class="client-widget-settings__content">
      <div
        v-if="loading"
        class="client-widget-settings__skeleton"
        role="status"
        aria-label="Загружаем настройки"
      >
        <SkeletonBlock v-for="index in 4" :key="index" />
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
      <Button
        v-if="error && !draft && !loading"
        :type="ButtonTypeEnum.secondary"
        :size="SizesEnum.little"
        @click="loadSites()"
      >
        Повторить
      </Button>
      <MenuEmptyState
        v-if="!loading && !error && !sites.length"
        text="Нет подключённых сайтов"
        hide-icon
      />
      <div v-if="sites.length > 1" class="client-widget-settings__field">
        Сайт
        <Dropdown
          :key="siteSelectorRevision"
          :options="siteOptions"
          :default-option="selectedSiteName"
          :disabled="loading || saving"
          aria-label="Сайт"
          data-testid="WidgetSettings-Site"
          @change="selectSite"
        />
      </div>

      <div
        v-if="draft"
        class="client-widget-settings__form"
        :aria-busy="saving"
      >
        <fieldset :disabled="saving">
          <label class="client-widget-settings__field" for="widget-greeting">
            <span class="client-widget-settings__section-title"
              >Приветственное сообщение</span
            >
            <Input
              v-model="draft.settings.initialMessage"
              class="initial client-widget-settings__input"
              input-id="widget-greeting"
              placeholder="Введите текст"
            />
          </label>

          <fieldset>
            <legend class="client-widget-settings__section-title">
              Часы работы
            </legend>
            <div class="client-widget-settings__hours">
              <TimePicker
                :model-value="pickerDate(draft.settings.schedule.start)"
                :disabled="saving"
                aria-label="Начало рабочего дня"
                data-testid="WidgetSettings-TimeStart"
                hide-clear-button
                @update:model-value="updateTime('start', $event)"
              />
              <span>до</span>
              <TimePicker
                :model-value="pickerDate(draft.settings.schedule.end)"
                :disabled="saving"
                aria-label="Конец рабочего дня"
                hide-clear-button
                @update:model-value="updateTime('end', $event)"
              />
            </div>
          </fieldset>

          <fieldset>
            <legend class="client-widget-settings__section-title">
              Рабочие дни
            </legend>
            <SelectList
              class="client-widget-settings__days"
              :is-opened="workingDaysOpen"
              :disabled="saving"
              is-use-anchor
              data-testid="WidgetSettings-Days"
              @change="workingDaysOpen = $event"
            >
              <template #header>
                <span
                  class="dropdown-yui-kit__text client-widget-settings__days-summary"
                  :title="workingDaysLabel"
                >
                  {{ workingDaysLabel }}
                </span>
                <Icon
                  :name="
                    workingDaysOpen
                      ? IconNameEnum.chevronUp
                      : IconNameEnum.chevronDown
                  "
                />
              </template>
              <template #options>
                <li
                  v-for="day in dayOptions"
                  :key="day.key"
                  class="client-widget-settings__day-option"
                  @click="
                    setWorkingDay(
                      day.key,
                      !draft.settings.schedule.days.includes(day.key)
                    )
                  "
                >
                  <Checkbox
                    :size="CheckboxSizeEnum.small"
                    :model-value="
                      draft.settings.schedule.days.includes(day.key)
                    "
                    :disabled="saving"
                    :aria-label="day.value"
                    :data-testid="`WidgetSettings-Day-${day.key}`"
                    @click.stop
                    @update:model-value="setWorkingDay(day.key, $event)"
                  />
                  {{ day.value }}
                </li>
              </template>
            </SelectList>
          </fieldset>

          <fieldset>
            <legend class="client-widget-settings__section-title">
              Соцсети
            </legend>
            <label
              v-for="platform in platforms"
              :key="platform.key"
              class="client-widget-settings__social"
              :for="`widget-${platform.key}`"
            >
              <span class="client-widget-settings__social-name">
                <span
                  class="client-widget-settings__social-icon"
                  aria-hidden="true"
                >
                  <ClientPlatformIcon :platform="platform.label" :size="20" />
                </span>
                {{ platform.label }}
              </span>
              <Input
                v-model="draft.settings.socialLinks[platform.key]"
                class="initial client-widget-settings__input"
                :input-id="`widget-${platform.key}`"
                placeholder="Введите ссылку"
              />
            </label>
          </fieldset>

          <label class="client-widget-settings__delay">
            Задержка открытия, с
            <InputNumber
              class="client-widget-settings__input"
              :model-value="delay"
              :min="0"
              :max="3600"
              :size="SizesEnum.small"
              input-message=""
              data-testid="WidgetSettings-Delay"
              @input.capture="delayEdited = true"
              @update:model-value="updateDelay"
            />
          </label>

          <fieldset>
            <legend class="client-widget-settings__section-title">
              Шаблоны сообщений
            </legend>
            <div
              v-for="(_, index) in draft.settings.welcomeMessages"
              :key="index"
              class="client-widget-settings__template"
            >
              <Input
                v-model="draft.settings.welcomeMessages[index]"
                class="initial client-widget-settings__input"
                :aria-label="`Шаблон ${index + 1}`"
                placeholder="Введите текст"
              />
              <Button
                :type="ButtonTypeEnum.ghost"
                :size="SizesEnum.little"
                :aria-label="`Удалить шаблон ${index + 1}`"
                @click="draft.settings.welcomeMessages.splice(index, 1)"
              >
                <Icon
                  :name="IconNameEnum.deleteSmall"
                  :width="16"
                  :height="16"
                />
              </Button>
            </div>
            <Button
              class="client-widget-settings__add"
              :type="ButtonTypeEnum.secondary"
              :size="SizesEnum.little"
              :disabled="draft.settings.welcomeMessages.length >= 10"
              @click.prevent="addTemplate"
            >
              <Icon :name="IconNameEnum.plus" :width="16" :height="16" />
              Добавить шаблон
            </Button>
          </fieldset>
        </fieldset>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  Checkbox,
  CheckboxSizeEnum,
  Dropdown,
  Icon,
  IconNameEnum,
  Input,
  InputNumber,
  SelectList,
  SizesEnum,
  TimePicker
} from '@pksep/yui';
import {
  ManagerRequestError,
  loadWidgetSites,
  managerRequest,
  recoverWidgetSettings,
  saveWidgetSettings,
  type WidgetSite
} from '../../composables/useManagerInquiries';
import { getAuthUser } from '../../composables/useAuth';
import { showErrorNotification } from '../../composables/useNotifications';
import { getConfig } from '../../services/useConfig';
import MenuSectionHeading from '../UI/MenuSectionHeading.vue';
import SkeletonBlock from '../UI/SkeletonBlock.vue';
import MenuEmptyState from '../Menu/MenuEmptyState.vue';
import ClientPlatformIcon from './ClientPlatformIcon.vue';

const emit = defineEmits<{ close: [] }>();
const props = defineProps<{ initialSites: WidgetSite[] }>();

const platforms = [
  { key: 'vk', label: 'ВКонтакте' },
  { key: 'avito', label: 'Авито' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'max', label: 'MAX' }
] as const;
const dayOptions = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье'
].map((value, index) => ({ key: (index + 1) % 7, value }));

interface WidgetSiteSettings {
  version: number;
  settings: {
    initialMessage: string;
    welcomeMessages: string[];
    socialLinks: Record<(typeof platforms)[number]['key'], string>;
    schedule: { start: string; end: string; days: number[]; timezone: string };
    autoOpenDelayMs: number | null;
  };
}

const sites = ref<WidgetSite[]>([]);
const siteId = ref('');
const siteSelectorRevision = ref(0);
const draft = ref<WidgetSiteSettings>();
const delay = ref(0);
const workingDaysOpen = ref(false);
let delayEdited = false;
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const ownerId = getAuthUser()?.id;
const ownerServer = getConfig().CHAT_API_DOMAIN;
let initialSettings = '';
let saveInFlight: Promise<boolean> | undefined;
let unmounting = false;

const siteOptions = computed(() =>
  sites.value.map(site => ({ key: site.id, value: site.name }))
);

const selectedSiteName = computed(
  () => sites.value.find(site => site.id === siteId.value)?.name
);

const workingDaysLabel = computed(
  (): string =>
    dayOptions
      .filter(day => draft.value?.settings.schedule.days.includes(day.key))
      .map(day => day.value)
      .join(', ') || 'Выберите дни'
);

const pickerDate = (time: string): string => {
  const [hours, minutes] = time.split(':').map(Number);

  return new Date(2000, 0, 15, hours, minutes).toISOString();
};

const updateTime = (field: 'start' | 'end', timestamp: string | null): void => {
  if (!draft.value || !timestamp) return;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return;
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  draft.value.settings.schedule[field] = `${hours}:${minutes}`;
};

const setWorkingDay = (day: number, checked: boolean): void => {
  if (!draft.value || saving.value) return;

  const days = new Set(draft.value.settings.schedule.days);
  if (checked) days.add(day);
  else days.delete(day);

  draft.value.settings.schedule.days = [...days];
};

const updateDelay = (value: number | string): void => {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds === delay.value) return;

  delayEdited = true;
  delay.value = seconds;
};

const settingsSnapshot = (
  settings: WidgetSiteSettings['settings']
): WidgetSiteSettings['settings'] => ({
  initialMessage: settings.initialMessage.trim(),
  welcomeMessages: settings.welcomeMessages
    .map(text => text.trim())
    .filter(Boolean),
  socialLinks: {
    vk: settings.socialLinks.vk.trim(),
    avito: settings.socialLinks.avito.trim(),
    telegram: settings.socialLinks.telegram.trim(),
    max: settings.socialLinks.max.trim()
  },
  schedule: {
    ...settings.schedule,
    days: [...settings.schedule.days].sort((a, b) => a - b)
  },
  autoOpenDelayMs: settings.autoOpenDelayMs
});

const apply = (record: WidgetSiteSettings): void => {
  initialSettings = JSON.stringify(settingsSnapshot(record.settings));
  draft.value = {
    ...record,
    settings: {
      ...record.settings,
      welcomeMessages: record.settings.welcomeMessages.length
        ? record.settings.welcomeMessages
        : ['', '', '']
    }
  };
  delayEdited = false;
  delay.value = (record.settings.autoOpenDelayMs ?? 0) / 1000;
};

const loadSettings = async (): Promise<void> => {
  if (!siteId.value) return;

  loading.value = true;
  draft.value = undefined;
  workingDaysOpen.value = false;
  error.value = '';

  try {
    apply(
      await managerRequest<WidgetSiteSettings>(
        `widget-sites/${encodeURIComponent(siteId.value)}`
      )
    );
  } catch {
    error.value = 'Не удалось загрузить настройки виджета.';
  } finally {
    loading.value = false;
  }
};

const loadSites = async (refresh = true): Promise<void> => {
  loading.value = true;
  error.value = '';

  try {
    await recoverWidgetSettings();
    sites.value = refresh ? await loadWidgetSites() : props.initialSites;
    if (!sites.value.some(site => site.id === siteId.value))
      siteId.value = sites.value[0]?.id ?? '';
    await loadSettings();
  } catch (cause) {
    error.value =
      cause instanceof ManagerRequestError && [404, 503].includes(cause.status)
        ? 'Сервис настроек виджета недоступен. Попробуйте ещё раз.'
        : 'Не удалось получить список сайтов.';
  } finally {
    loading.value = false;
  }
};

const selectSite = async (id: string): Promise<void> => {
  if (id === siteId.value || loading.value || saving.value) return;
  if (!(await save())) {
    siteSelectorRevision.value += 1;
    return;
  }
  if (unmounting) return;

  siteId.value = id;
  await loadSettings();
};

const addTemplate = (): void => {
  const templates = draft.value?.settings.welcomeMessages;
  if (templates && templates.length < 10) templates.push('');
};

const persistSettings = async (
  id: string,
  record: WidgetSiteSettings
): Promise<boolean> => {
  try {
    const updated = await saveWidgetSettings<WidgetSiteSettings>(id, record);
    apply(updated);

    return true;
  } catch (cause) {
    const message =
      cause instanceof ManagerRequestError && cause.status === 409
        ? 'Настройки изменил другой сотрудник. Откройте их заново.'
        : cause instanceof ManagerRequestError && cause.status === 400
          ? 'Проверьте часы, длину текста и HTTPS-ссылки на выбранные платформы.'
          : 'Не удалось сохранить настройки виджета.';
    error.value = message;
    if (unmounting) showErrorNotification(message);

    return false;
  } finally {
    saveInFlight = undefined;
    saving.value = false;
  }
};

const save = (): Promise<boolean> => {
  if (saveInFlight) return saveInFlight;
  if (!draft.value || !siteId.value) return Promise.resolve(true);

  const settings = settingsSnapshot({
    ...draft.value.settings,
    // Старое отключение таймера не меняется при редактировании других полей.
    autoOpenDelayMs: delayEdited
      ? Math.round(delay.value * 1000)
      : draft.value.settings.autoOpenDelayMs
  });
  if (JSON.stringify(settings) === initialSettings)
    return Promise.resolve(true);
  if (
    getAuthUser()?.id !== ownerId ||
    getConfig().CHAT_API_DOMAIN !== ownerServer
  )
    return Promise.resolve(false);

  error.value = '';
  saving.value = true;
  saveInFlight = persistSettings(siteId.value, {
    version: draft.value.version,
    settings
  });

  return saveInFlight;
};

const closePanel = async (): Promise<void> => {
  if (await save()) emit('close');
};

const onPageHide = (): void => {
  void save();
};

onMounted((): void => {
  window.addEventListener('beforeunload', onPageHide);
  window.addEventListener('pagehide', onPageHide);
  void loadSites(false);
});
onBeforeUnmount((): void => {
  window.removeEventListener('beforeunload', onPageHide);
  window.removeEventListener('pagehide', onPageHide);
  unmounting = true;
  void save();
});
</script>

<style scoped>
.client-widget-settings {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
.client-widget-settings > header {
  flex-shrink: 0;
}
.client-widget-settings__content {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 10px var(--menu-section-content-inset, 10px);
}
.client-widget-settings__skeleton {
  display: grid;
  gap: 8px;
}
.client-widget-settings__skeleton > * {
  height: 36px;
}
.client-widget-settings fieldset:not(.input-yui-kit) {
  display: grid;
  gap: 8px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.client-widget-settings__form > fieldset {
  gap: 0;
}
.client-widget-settings__section-title {
  display: block;
  margin: 10px 0;
  padding: 0;
  font-size: 16px;
  font-weight: 400;
  line-height: 20px;
}
.client-widget-settings__field {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.client-widget-settings__form .client-widget-settings__field {
  gap: 0;
}
.client-widget-settings
  :deep(.client-widget-settings__input.input-yui-kit.initial),
.client-widget-settings :deep(.time-picker-select-content),
.client-widget-settings__days :deep(.select-list-yui-kit__current) {
  min-width: 0;
  background-color: var(--table-surface-search, #f8f9fd);
}
.client-widget-settings
  :deep(.client-widget-settings__input.input-yui-kit.initial) {
  box-sizing: border-box;
  min-height: 36px;
}
.client-widget-settings__hours,
.client-widget-settings__template,
.client-widget-settings__social-name {
  display: flex;
  align-items: center;
  gap: 6px;
}
.client-widget-settings__days {
  min-width: 0;
}
.client-widget-settings__days :deep(.select-list-yui-kit__current) {
  box-sizing: border-box;
  width: 100%;
  min-height: 36px;
  gap: 8px;
}
.client-widget-settings__days-summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.client-widget-settings__days :deep(.select-list-yui-kit__list) {
  box-sizing: border-box;
  width: max-content;
  max-width: calc(100vw - 20px);
  max-height: 50vh;
  padding: 4px;
}
.client-widget-settings__day-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 5px;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 20px;
  cursor: pointer;
}
.client-widget-settings__day-option:hover,
.client-widget-settings__day-option:focus-within {
  background-color: var(--action-secondary-hover-bg);
}
.client-widget-settings__social {
  display: grid;
  grid-template-columns: minmax(104px, max-content) minmax(0, 1fr);
  column-gap: 10px;
  align-items: center;
  font-size: 14px;
}
.client-widget-settings__social-icon {
  display: grid;
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
  place-items: center;
}
.client-widget-settings__delay {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 86px;
  column-gap: 14px;
  align-items: center;
  margin: 10px 0 0;
  font-size: 14px;
}
.client-widget-settings__delay :deep(.input-yui-kit_number) {
  grid-template-columns: minmax(0, 1fr) auto;
}
.client-widget-settings__delay :deep(.input-yui-kit__input) {
  min-width: 0;
  width: 100%;
}
.client-widget-settings__template :deep(.input-yui-kit) {
  flex: 1;
  min-width: 0;
}
.client-widget-settings__add.button-yui-kit {
  justify-self: end;
  height: 30px;
  min-height: 30px;
  padding-block: 0;
}
.client-widget-settings [role='alert'] {
  color: var(--status-error);
}
</style>
