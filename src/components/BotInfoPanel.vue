<template>
  <section
    v-if="props.user"
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
        :class="[
          'bot-info-panel__avatar-button',
          { 'bot-info-panel__avatar-button--disabled': !canManageBot }
        ]"
        :disabled="!canManageBot"
        @click="openFile"
      >
        <BotAvatar
          :path="form.avatarUrl"
          :initials="form.name || 'Б'"
          class="bot-info-panel__avatar"
          :is-online="false"
          :is-edit="canManageBot"
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
        :class="{
          'bot-avatar-cropper-modal': true,
          'bot-avatar-cropper-modal--mobile': props.isMobile
        }"
        :image="avatarFile"
        :open="isEditAvatar"
        :position="props.isMobile ? 'bottom' : 'center'"
        :width="props.isMobile ? '100%' : '650px'"
        @unmount-close="closeEditAvatar"
        @unmount-save="handleAvatarCropSave"
      />

      <div v-if="!canManageBot" class="bot-info-panel__identity">
        <h3
          class="bot-info-panel__name"
          :data-testid="`${props.dataTestid}-Name`"
        >
          {{ form.name || 'Бот' }}
        </h3>
        <p
          v-if="form.username"
          class="bot-info-panel__subtitle"
          :data-testid="`${props.dataTestid}-Subtitle`"
        >
          {{ form.username }}
        </p>
      </div>

      <div v-if="canManageBot" class="bot-info-panel__fields">
        <label class="bot-editor__field">
          <span class="bot-editor__label">Название:</span>
          <Input
            class="minor bot-info-panel__profile-input"
            placeholder="Бот для сбора статистики"
            :model-value="form.name"
            @update:model-value="handleNameChange"
          />
        </label>

        <label class="bot-editor__field">
          <div>
            <span class="bot-editor__label">Username бота:</span>
          </div>
          <div class="bot-info-panel__value-row">
            <Input
              class="minor bot-info-panel__input bot-info-panel__profile-input"
              placeholder="@botname"
              :model-value="form.username"
              @update:model-value="handleUsernameChange"
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

      <div
        v-if="actionButtonCount > 0"
        :class="[
          'menu-info__buttons',
          'bot-info-panel__actions',
          {
            'bot-info-panel__actions--single': actionButtonCount === 1,
            'bot-info-panel__actions--double': actionButtonCount === 2
          }
        ]"
      >
        <Button
          v-if="canDeleteBot"
          :type="ButtonTypeEnum.secondary"
          :size="SizesEnum.large"
          class="menu-info__secondary-button bot-info-panel__action bot-info-panel__delete"
          @click="isDeleteConfirmOpen = true"
        >
          <Icon
            class="bot-info-panel__action-icon"
            :name="IconNameEnum.deleteSmall"
          />
          <span>Удалить бот</span>
        </Button>

        <Button
          v-if="canToggleMute"
          :type="ButtonTypeEnum.secondary"
          :size="SizesEnum.large"
          class="menu-info__secondary-button bot-info-panel__action"
          :data-testid="`${props.dataTestid}-MuteButton`"
          @click="handleToggleMute"
        >
          <component
            :is="isMuted ? MuteIcon : UnmuteIcon"
            class="bot-info-panel__action-icon"
          />
          <span>{{ isMuted ? 'Звук выкл.' : 'Звук вкл.' }}</span>
        </Button>

        <Button
          v-if="canOpenChat"
          :type="ButtonTypeEnum.secondary"
          :size="SizesEnum.large"
          class="menu-info__secondary-button bot-info-panel__action bot-info-panel__open-chat"
          :data-testid="`${props.dataTestid}-OpenChatButton`"
          :disabled="isOpeningChat"
          @click="handleOpenChat"
        >
          <MessageIcon class="bot-info-panel__action-icon" />
          <span>Перейти в чат</span>
        </Button>
      </div>

      <div v-if="canManageBot && isDirty" class="bot-info-panel__save">
        <Button
          :type="ButtonTypeEnum.primary"
          :size="SizesEnum.small"
          :disabled="!isFormValid || isSaving || isUploadingAvatar"
          @click="handleSave"
        >
          Сохранить
        </Button>
      </div>
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
import MessageIcon from './UI/MessageIcon.vue';
import MuteIcon from './UI/MuteIcon.vue';
import UnmuteIcon from './UI/UnmuteIcon.vue';
import type { ITopic, IUser } from './interfaces/interfaces';
import {
  deleteBotTopic,
  getBotInitialForm,
  updateBotTopic
} from '../composables/useBots';
import { getAuthUser } from '../composables/useAuth';
import { navigateToDialogs } from '../composables/navigation';
import { showErrorNotification } from '../composables/useNotifications';
import { useTopics } from '../composables/useTopics';
import { useUserInfoModal } from '../composables/useUserInfoModal';
import { getChatSDK } from '../services/useChat';
import { TopicType } from '../services/useChatSDK/types';
import { copyTextToClipboard } from '../utils/copyTextToClipboard';
import {
  getBotApiKey,
  getBotUsername,
  getBotOwnerUserId,
  isLocalBotTopic,
  maskBotSecret
} from '../utils/bot';
import { uploadAvatarToMinio } from '../utils/uploadAvatarToMinio';

const props = withDefaults(
  defineProps<{
    user?: IUser | null;
    topic?: ITopic | null;
    showHeader?: boolean;
    isMobile?: boolean;
    dataTestid?: string;
  }>(),
  {
    showHeader: false,
    isMobile: false,
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
const isSaving = ref(false);
const isUploadingAvatar = ref(false);
const isOpeningChat = ref(false);
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

const { resolveDirectTopicByUserId, handleUserInfoOpenChat } =
  useUserInfoModal();
const { toggleMuteTopic } = useTopics();

const syncForm = (): void => {
  const next = getBotInitialForm(props.topic);
  const botUser = props.topic?.user || props.user;

  form.name = next.name || botUser?.initials || '';
  form.username = next.username || getBotUsername(botUser);
  form.apiKey = next.apiKey || getBotApiKey(botUser);
  form.avatarUrl = botUser?.avatarUrl || props.topic?.avatarUrl || '';

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
    props.user?.avatarUrl,
    props.topic?.user?.ex,
    props.user?.ex
  ],
  () => {
    syncForm();
  },
  { immediate: true }
);

const canManageBot = computed(() => {
  const authUser = getAuthUser();

  if (!authUser?.id || !props.topic) {
    return false;
  }

  if (isLocalBotTopic(props.topic)) {
    return true;
  }

  return getBotOwnerUserId(props.topic.user || props.user) === authUser.id;
});

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

const canDeleteBot = computed(() => canManageBot.value);
const directTopic = computed(() => {
  const targetUser = props.user;

  if (!targetUser?.id) {
    return null;
  }

  if (
    props.topic?.type === TopicType.DM &&
    props.topic.user?.id === targetUser.id
  ) {
    return props.topic;
  }

  return resolveDirectTopicByUserId(targetUser.id);
});
const canOpenChat = computed(() => {
  const authUser = getAuthUser();

  return !!props.user?.id && props.user.id !== authUser?.id;
});
const canToggleMute = computed(() => !!directTopic.value?.id);
const isMuted = computed(() => !!directTopic.value?.info?.isMute);
const actionButtonCount = computed(
  () =>
    Number(canDeleteBot.value) +
    Number(canToggleMute.value) +
    Number(canOpenChat.value)
);

const openFile = (): void => {
  if (!canManageBot.value) {
    return;
  }

  fileInputRef.value?.click();
};

const resetAvatarInput = (): void => {
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
};

const handleAvatarChange = async (event: Event): Promise<void> => {
  if (!canManageBot.value) {
    resetAvatarInput();
    return;
  }

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
  if (!canManageBot.value) {
    return;
  }

  isUploadingAvatar.value = true;

  try {
    form.avatarUrl = await uploadAvatarToMinio(croppedFile);
    avatarFile.value = croppedFile;
    isEditAvatar.value = false;
    resetAvatarInput();
  } catch (error) {
    showErrorNotification(
      error instanceof Error ? error.message : 'Failed to upload bot avatar'
    );
  } finally {
    isUploadingAvatar.value = false;
  }
};

const handleCopyApiKey = async (): Promise<void> => {
  if (!form.apiKey) {
    return;
  }

  await copyTextToClipboard(form.apiKey);
};

const handleNameChange = (value: string): void => {
  if (!canManageBot.value) {
    return;
  }

  form.name = value;
};

const handleUsernameChange = (value: string): void => {
  if (!canManageBot.value) {
    return;
  }

  form.username = value;
};

const handleOpenChat = async (): Promise<void> => {
  const targetUser = props.user;

  if (!canOpenChat.value || !targetUser?.id || isOpeningChat.value) {
    return;
  }

  isOpeningChat.value = true;

  try {
    let targetTopicId = directTopic.value?.id || null;

    if (!targetTopicId) {
      const sdk = getChatSDK();
      const topic = await sdk.createTopic({ peerId: targetUser.id });
      targetTopicId = topic?.id || null;
    }

    if (!targetTopicId) {
      return;
    }

    handleUserInfoOpenChat();
    emits('close');
    navigateToDialogs(targetTopicId);
  } finally {
    isOpeningChat.value = false;
  }
};

const handleToggleMute = (): void => {
  if (!directTopic.value) {
    return;
  }

  toggleMuteTopic(directTopic.value);
};

const handleSave = async (): Promise<void> => {
  if (
    !props.topic ||
    !props.user ||
    !canManageBot.value ||
    !isFormValid.value ||
    isUploadingAvatar.value
  ) {
    return;
  }

  isSaving.value = true;

  try {
    await updateBotTopic(props.topic, {
      name: form.name,
      username: form.username,
      apiKey: form.apiKey,
      avatarUrl: form.avatarUrl
    });

    syncForm();
  } catch (error) {
    showErrorNotification(
      error instanceof Error ? error.message : 'Не удалось сохранить бота'
    );
  } finally {
    isSaving.value = false;
  }
};

const handleDelete = async (): Promise<void> => {
  if (!props.topic || !canDeleteBot.value) {
    return;
  }

  try {
    await deleteBotTopic(props.topic);
    isDeleteConfirmOpen.value = false;
    emits('close');
  } catch (error) {
    showErrorNotification(
      error instanceof Error ? error.message : 'Не удалось удалить бота'
    );
  }
};
</script>
