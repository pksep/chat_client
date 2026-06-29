<template>
  <section
    v-if="props.topic && props.user"
    class="bot-info-panel"
    :data-testid="`${props.dataTestid}-Container`"
  >
    <header
      v-if="props.showHeader"
      class="bot-info-panel__header"
      :data-testid="`${props.dataTestid}-Header`"
    >
      <div class="bot-info-panel__header-space" />
      <h4 class="bot-info-panel__title">Информация о боте</h4>
      <Button
        class="bot-info-panel__close"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        @click="emits('close')"
      >
        <Icon :name="IconNameEnum.crossLarge" />
      </Button>
    </header>

    <div class="bot-info-panel__body">
      <button
        type="button"
        class="bot-info-panel__avatar-button"
        @click="openFile"
      >
        <BotAvatar
          :path="form.avatarUrl"
          :initials="form.name || 'Б'"
          class="bot-info-panel__avatar"
          :is-online="false"
          is-edit
        />
      </button>

      <input
        ref="fileInputRef"
        class="bot-editor__file-input"
        type="file"
        accept="image/*"
        @change="handleAvatarChange"
      />
      <ModalCroppedAvatar
        :image="avatarFile"
        :open="isEditAvatar"
        @unmount-close="closeEditAvatar"
        @unmount-save="handleAvatarCropSave"
      />

      <div class="bot-info-panel__fields">
        <label class="bot-editor__field">
          <span class="bot-editor__label">Название:</span>
          <Input
            class="minor"
            placeholder="Бот для сбора статистики"
            :model-value="form.name"
            @update:model-value="value => (form.name = value)"
          />
        </label>

        <label class="bot-editor__field">
          <div>
            <span class="bot-editor__label">Username бота:</span>
          </div>
          <div class="bot-info-panel__value-row">
            <Input
              class="minor bot-info-panel__input"
              placeholder="@botname"
              :model-value="form.username"
              @update:model-value="value => (form.username = value)"
            />
          </div>
        </label>

        <label v-if="false" class="bot-editor__field">
          <div class="bot-editor__label__actions">
            <span class="bot-editor__label">API ключ:</span>
            <button
              type="button"
              class="bot-info-panel__icon-button"
              aria-label="Скопировать API ключ"
              @click="handleCopyApiKey"
            >
              <CopyIcon />
            </button>
            <button
              type="button"
              class="bot-info-panel__icon-button"
              :aria-label="
                isApiKeyVisible ? 'Скрыть API ключ' : 'Показать API ключ'
              "
              @click="isApiKeyVisible = !isApiKeyVisible"
            >
              <Icon
                :name="isApiKeyVisible ? IconNameEnum.eyeOff : IconNameEnum.eye"
              />
            </button>
          </div>
          <div class="bot-info-panel__value-row">
            <Input
              class="minor bot-info-panel__input"
              :model-value="visibleApiKeyValue"
              readonly
            />
          </div>
        </label>
      </div>

      <div v-if="isDirty" class="bot-info-panel__save">
        <Button
          :type="ButtonTypeEnum.primary"
          :size="SizesEnum.small"
          :disabled="!isFormValid"
          @click="handleSave"
        >
          Сохранить
        </Button>
      </div>
    </div>

    <div class="bot-info-panel__footer">
      <Button
        :type="ButtonTypeEnum.secondary"
        class="bot-info-panel__delete"
        @click="isDeleteConfirmOpen = true"
      >
        <Icon :name="IconNameEnum.deleteSmall" />
        <span>Удалить</span>
      </Button>
    </div>

    <ConfirmModal
      :open="isDeleteConfirmOpen"
      title="Удаление бота"
      description="Вы уверены, что хотите удалить бота?"
      @unmount-close="isDeleteConfirmOpen = false"
      @unmount-confirm="handleDelete"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  Input,
  ModalCroppedAvatar,
  SizesEnum
} from '@pksep/yui';
import BotAvatar from './UI/BotAvatar.vue';
import CopyIcon from './UI/CopyIcon.vue';
import ConfirmModal from './UI/ConfirmModal.vue';
import type { ITopic, IUser } from './interfaces/interfaces';
import { fileToDataURL } from '../utils/fileToDataURL';
import {
  deleteBotTopic,
  getBotInitialForm,
  updateLocalBotTopic
} from '../composables/useBots';
import { copyTextToClipboard } from '../utils/copyTextToClipboard';
import { maskBotSecret } from '../utils/bot';
import { navigateToDialogsList } from '../composables/navigation';

const props = withDefaults(
  defineProps<{
    user?: IUser | null;
    topic?: ITopic | null;
    showHeader?: boolean;
    dataTestid?: string;
  }>(),
  {
    showHeader: false,
    dataTestid: 'BotInfoPanel'
  }
);

const emits = defineEmits<{
  (e: 'close'): void;
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const avatarFile = ref<File | null>(null);
const isEditAvatar = ref(false);
const isApiKeyVisible = ref(false);
const isDeleteConfirmOpen = ref(false);
const form = reactive({
  name: '',
  username: '',
  apiKey: '',
  avatarUrl: ''
});
const initialForm = reactive({
  name: '',
  username: '',
  apiKey: '',
  avatarUrl: ''
});

const syncForm = (): void => {
  const next = getBotInitialForm(props.topic);

  form.name = next.name;
  form.username = next.username;
  form.apiKey = next.apiKey;
  form.avatarUrl = props.topic?.user?.avatarUrl || props.topic?.avatarUrl || '';

  initialForm.name = form.name;
  initialForm.username = form.username;
  initialForm.apiKey = form.apiKey;
  initialForm.avatarUrl = form.avatarUrl;
};

watch(
  () => [
    props.topic?.id,
    props.user?.id,
    props.topic?.name,
    props.user?.nickname,
    props.user?.avatarUrl
  ],
  () => {
    syncForm();
  },
  { immediate: true }
);

const isFormValid = computed(
  () => form.name.trim().length > 0 && form.username.trim().length > 0
);

const isDirty = computed(
  () =>
    form.name.trim() !== initialForm.name.trim() ||
    form.username.trim() !== initialForm.username.trim() ||
    form.apiKey !== initialForm.apiKey ||
    form.avatarUrl !== initialForm.avatarUrl
);

const visibleApiKeyValue = computed(() =>
  isApiKeyVisible.value ? form.apiKey : maskBotSecret(form.apiKey)
);

const openFile = (): void => {
  fileInputRef.value?.click();
};

const resetAvatarInput = (): void => {
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
};

const handleAvatarChange = async (event: Event): Promise<void> => {
  const file = (event.target as HTMLInputElement).files?.[0];

  if (!file) {
    return;
  }

  avatarFile.value = file;
  isEditAvatar.value = true;
};

const closeEditAvatar = (): void => {
  isEditAvatar.value = false;
  resetAvatarInput();
};

const handleAvatarCropSave = async (croppedFile: File): Promise<void> => {
  form.avatarUrl = await fileToDataURL(croppedFile);
  avatarFile.value = croppedFile;
  isEditAvatar.value = false;
  resetAvatarInput();
};

const handleCopyApiKey = async (): Promise<void> => {
  if (!form.apiKey) {
    return;
  }

  await copyTextToClipboard(form.apiKey);
};

const handleSave = (): void => {
  if (!props.topic || !props.user || !isFormValid.value) {
    return;
  }

  updateLocalBotTopic(props.topic, {
    name: form.name,
    username: form.username,
    apiKey: form.apiKey,
    avatarUrl: form.avatarUrl
  });

  syncForm();
};

const handleDelete = async (): Promise<void> => {
  if (!props.topic) {
    return;
  }

  await deleteBotTopic(props.topic);
  isDeleteConfirmOpen.value = false;
  emits('close');
  navigateToDialogsList();
};
</script>
