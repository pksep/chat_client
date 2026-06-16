<template>
  <MobileModal
    class="new-bot-mobile"
    :open="props.open"
    title="Создать бота"
    close-button-text="Назад"
    :show-divider="true"
    :is-disabled-start-button="!isFormValid"
    start-button-text="Создать"
    :data-testid="`${props.dataTestid}-NewBotMobileModal-Container`"
    @unmount-close="handleClose"
    @unmount-next="handleCreate"
  >
    <div class="bot-editor bot-editor--mobile">
      <button class="bot-editor__avatar-button" type="button" @click="openFile">
        <BotAvatar
          :path="form.avatarUrl"
          :initials="form.name || 'Б'"
          class="bot-editor__avatar"
        />
      </button>

      <input
        ref="fileInputRef"
        class="bot-editor__file-input"
        type="file"
        accept="image/*"
        @change="handleAvatarChange"
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
            placeholder="Введите username или @username"
            :model-value="form.username"
            @update:model-value="value => (form.username = value)"
          />
        </label>
      </div>
    </div>
  </MobileModal>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { Input } from '@pksep/yui';
import MobileModal from '../UI/MobileModal.vue';
import BotAvatar from '../UI/BotAvatar.vue';
import { fileToDataURL } from '../../utils/fileToDataURL';
import { createLocalBotTopic } from '../../composables/useBots';
import { navigateToDialogs } from '../../composables/navigation';

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

const handleAvatarChange = async (event: Event): Promise<void> => {
  const file = (event.target as HTMLInputElement).files?.[0];

  if (!file) {
    return;
  }

  form.avatarUrl = await fileToDataURL(file);
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
