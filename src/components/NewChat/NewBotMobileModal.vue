<template>
  <MobileModal
    class="new-bot-mobile"
    :open="props.open"
    title="Создать бота"
    close-button-text="Назад"
    :show-divider="true"
    :data-testid="`${props.dataTestid}-NewBotMobileModal-Container`"
    @unmount-close="handleClose"
  >
    <div class="new-bot-mobile__body">
      <div class="bot-editor bot-editor--mobile">
        <template v-if="!createdToken">
          <button
            class="bot-editor__avatar-button"
            type="button"
            @click="openFile"
          >
            <BotAvatar
              :path="form.avatarUrl"
              :initials="form.name || 'Б'"
              class="bot-editor__avatar"
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
            class="bot-avatar-cropper-modal bot-avatar-cropper-modal--mobile"
            :image="avatarFile"
            :open="isEditAvatar"
            position="bottom"
            width="100%"
            @unmount-close="closeEditAvatar"
            @unmount-save="handleAvatarCropSave"
          />

          <div class="bot-editor__fields">
            <label class="bot-editor__field">
              <span class="bot-editor__label">Название:</span>
              <Input
                class="minor"
                placeholder="Введите название"
                :model-value="form.name"
                @update:model-value="value => (form.name = value)"
              />
            </label>

            <label class="bot-editor__field">
              <span class="bot-editor__label">Username бота:</span>
              <Input
                class="minor"
                placeholder="только a-z, 0-9, _"
                :model-value="form.username"
                @update:model-value="value => (form.username = value)"
              />
            </label>
          </div>
        </template>

        <div v-else class="bot-editor__created">
          <p class="bot-editor__created-title">Бот создан</p>
          <p class="bot-editor__created-hint">
            Сохраните токен — он показывается один раз. Запустите с ним
            SDK-бота, чтобы он отвечал в этом чате.
          </p>
          <div
            class="bot-editor__token"
            role="button"
            tabindex="0"
            @click="copyToken"
          >
            {{ createdToken }}
          </div>
        </div>
      </div>

      <Button
        class="new-bot-mobile__submit"
        :type="ButtonTypeEnum.primary"
        :size="SizesEnum.large"
        :disabled="isStartDisabled"
        @click="handleNext"
      >
        {{ startButtonText }}
      </Button>
    </div>
  </MobileModal>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  Input,
  MessageTypeEnum,
  ModalCroppedAvatar,
  SizesEnum
} from '@pksep/yui';
import { navigateToDialogs } from '../../composables/navigation';
import { createBotViaGateway } from '../../composables/useBots';
import {
  showErrorNotification,
  showNotification
} from '../../composables/useNotifications';
import { fileToDataURL } from '../../utils/fileToDataURL';
import MobileModal from '../UI/MobileModal.vue';
import BotAvatar from '../UI/BotAvatar.vue';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    dataTestid?: string;
  }>(),
  {
    open: false,
    dataTestid: 'NewBotMobileModal'
  }
);

const emits = defineEmits<{
  (e: 'unmount-close'): void;
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const avatarFile = ref<File | null>(null);
const isEditAvatar = ref(false);
const isCreating = ref(false);
const createdToken = ref('');
const createdTopicId = ref('');
const form = reactive({
  name: '',
  username: '',
  avatarUrl: ''
});

const isFormValid = computed(
  () => form.name.trim().length > 0 && form.username.trim().length > 0
);

const startButtonText = computed(() =>
  createdToken.value
    ? 'Открыть чат'
    : isCreating.value
      ? 'Создание…'
      : 'Создать'
);

const isStartDisabled = computed(() =>
  createdToken.value ? false : !isFormValid.value || isCreating.value
);

const resetForm = (): void => {
  form.name = '';
  form.username = '';
  form.avatarUrl = '';
  avatarFile.value = null;
  isEditAvatar.value = false;
  isCreating.value = false;
  createdToken.value = '';
  createdTopicId.value = '';

  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
};

const handleClose = (): void => {
  resetForm();
  emits('unmount-close');
};

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

const handleCreate = async (): Promise<void> => {
  if (isCreating.value) {
    return;
  }

  isCreating.value = true;

  try {
    const result = await createBotViaGateway({
      name: form.name,
      username: form.username,
      avatarUrl: form.avatarUrl,
      avatarFile: avatarFile.value
    });

    if (!result?.topic?.id) {
      showErrorNotification('Не удалось создать бота');
      return;
    }

    createdToken.value = result.token;
    createdTopicId.value = result.topic.id;

    showNotification({
      title: 'Бот создан',
      description: 'Сохраните токен — он показан в окне один раз',
      type: MessageTypeEnum.success
    });
  } catch (error) {
    showErrorNotification(
      error instanceof Error ? error.message : 'Не удалось создать бота'
    );
  } finally {
    isCreating.value = false;
  }
};

const copyToken = async (): Promise<void> => {
  if (!createdToken.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(createdToken.value);
    showNotification({
      title: 'Готово',
      description: 'Токен скопирован в буфер обмена',
      type: MessageTypeEnum.success
    });
  } catch {
    showErrorNotification('Не удалось скопировать токен');
  }
};

const goToChat = (): void => {
  const topicId = createdTopicId.value;

  handleClose();

  if (topicId) {
    navigateToDialogs(topicId);
  }
};

// Кнопка «Создать» в шапке MobileModal: до создания — создаём бота,
// после — открываем чат с ним.
const handleNext = (): void => {
  if (createdToken.value) {
    goToChat();
    return;
  }

  void handleCreate();
};
</script>

<style scoped lang="scss">
.new-bot-mobile__body {
  min-height: 100%;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 16px;
}

.bot-editor--mobile {
  display: grid;
  align-content: start;
  gap: 22px;
  padding: 14px 16px 0;
}

.bot-editor--mobile .bot-editor__avatar-button {
  justify-self: center;
  padding: 0;
  border: 0;
  background: transparent;
}

.bot-editor--mobile .bot-editor__avatar {
  --size-avatar: 86px;
}

.bot-editor--mobile .bot-editor__fields {
  display: grid;
  gap: 14px;
}

.bot-editor--mobile .bot-editor__field {
  display: grid;
  gap: 8px;
}

.bot-editor--mobile .bot-editor__label {
  color: var(--text-grey);
  font-size: 16px;
  font-weight: 600;
  line-height: 20px;
}

.new-bot-mobile__submit.button-yui-kit {
  width: calc(100% - 20px);
  min-height: 48px;
  margin: 0 10px 10px;
  justify-content: center;
}

.bot-editor__created {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bot-editor__created-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.bot-editor__created-hint {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.4;
}

.bot-editor__token {
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(127, 127, 127, 0.12);
  font-family: monospace;
  font-size: 13px;
  word-break: break-all;
  cursor: pointer;
  user-select: all;
}
</style>
