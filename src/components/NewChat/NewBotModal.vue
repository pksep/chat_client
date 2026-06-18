<template>
  <Modal
    :open="props.open"
    class="new-bot"
    position="center"
    :data-testid="`${props.dataTestid}-NewBotModal-Container`"
    @close="handleClose"
  >
    <header class="new-contact__header">
      Создать бота
      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        class="new-contact__button-close"
        @click="handleClose"
      >
        <Icon :name="IconNameEnum.crossSmall" />
      </Button>
    </header>

    <div class="bot-editor">
      <button class="bot-editor__avatar-button" type="button" @click="openFile">
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
        :image="avatarFile"
        :open="isEditAvatar"
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
            placeholder="Введите уникальное имя"
            :model-value="form.username"
            @update:model-value="value => (form.username = value)"
          />
        </label>
      </div>

      <div class="bot-editor__footer bot-editor__footer--desktop">
        <Button
          :type="ButtonTypeEnum.primary"
          :size="SizesEnum.small"
          :disabled="!isFormValid"
          @click="handleCreate"
        >
          Создать
        </Button>
      </div>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  Input,
  ModalCroppedAvatar,
  Modal,
  SizesEnum
} from '@pksep/yui';
import { navigateToDialogs } from '../../composables/navigation';
import { createLocalBotTopic } from '../../composables/useBots';
import { fileToDataURL } from '../../utils/fileToDataURL';
import BotAvatar from '../UI/BotAvatar.vue';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    dataTestid?: string;
  }>(),
  {
    open: false,
    dataTestid: 'NewBotModal'
  }
);

const emits = defineEmits<{
  (e: 'unmount-close'): void;
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const avatarFile = ref<File | null>(null);
const isEditAvatar = ref(false);
const form = reactive({
  name: '',
  username: '',
  avatarUrl: ''
});

const isFormValid = computed(
  () => form.name.trim().length > 0 && form.username.trim().length > 0
);

const resetForm = (): void => {
  form.name = '';
  form.username = '';
  form.avatarUrl = '';
  avatarFile.value = null;
  isEditAvatar.value = false;

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

const handleCreate = (): void => {
  const topic = createLocalBotTopic({
    name: form.name,
    username: form.username,
    avatarUrl: form.avatarUrl
  });

  if (!topic?.id) {
    return;
  }

  navigateToDialogs(topic.id);
  handleClose();
};
</script>
