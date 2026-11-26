<template>
  <MobileModal
    v-if="isMobile"
    class="mobile-modal confirm__modal__mobile confirm__modal__mobile--pin"
    headerClass="hidden"
    :show-divider="false"
    :open="props.open"
    @unmount-close="handleCloseModal"
  >
    <h2 class="confirm__modal__title">{{ props.title }}</h2>
    <p v-if="props.description" class="confirm__modal__description">
      {{ props.description }}
    </p>
    <label v-if="!props.editing" class="confirm__modal__scope" @click.stop>
      <Checkbox
        :model-value="props.pinForEveryone"
        :circular="CheckboxCircularEnum.circled"
        @update:model-value="handleUpdatePinForEveryone"
      />
      <span>{{ props.scopeLabel }}</span>
    </label>
    <textarea
      class="pin-comment-input"
      :disabled="!props.commentsEnabled"
      :value="props.comment"
      aria-label="Комментарий к закреплению"
      placeholder="Введите комментарий"
      maxlength="4000"
      rows="4"
      @input="
        emits('update:comment', ($event.target as HTMLTextAreaElement).value)
      "
      @click.stop
    />
    <p v-if="props.error" role="alert">{{ props.error }}</p>
    <Button :type="ButtonTypeEnum.primary" @click.stop="handleCloseModal">
      {{ props.editing ? 'Отмена' : 'Нет' }}
    </Button>
    <Button
      :type="ButtonTypeEnum.secondary"
      :disabled="props.confirmDisabled"
      @click.stop="handleConfirmModal"
    >
      {{ props.editing ? 'Сохранить' : 'Да' }}
    </Button>
  </MobileModal>

  <Modal
    v-else
    :open="props.open"
    position="center"
    width="492px"
    class="confirm__modal confirm__modal--pin"
    :class="{ 'confirm__modal--pin-edit': props.editing }"
    @close="handleCloseModal"
    @click.stop
  >
    <h2 class="confirm__modal__title">{{ props.title }}</h2>
    <p v-if="props.description" class="confirm__modal__description">
      {{ props.description }}
    </p>
    <label v-if="!props.editing" class="confirm__modal__scope" @click.stop>
      <Checkbox
        :model-value="props.pinForEveryone"
        :circular="CheckboxCircularEnum.circled"
        @update:model-value="handleUpdatePinForEveryone"
      />
      <span>{{ props.scopeLabel }}</span>
    </label>
    <textarea
      class="pin-comment-input"
      :disabled="!props.commentsEnabled"
      :value="props.comment"
      aria-label="Комментарий к закреплению"
      placeholder="Введите комментарий"
      maxlength="4000"
      rows="4"
      @input="
        emits('update:comment', ($event.target as HTMLTextAreaElement).value)
      "
      @click.stop
    />
    <p v-if="props.error" role="alert">{{ props.error }}</p>
    <div class="confirm__modal__buttons">
      <Button
        :type="ButtonTypeEnum.secondary"
        :size="SizesEnum.small"
        @click.stop="handleCloseModal"
      >
        {{ props.editing ? 'Отмена' : 'Нет' }}
      </Button>
      <Button
        :type="ButtonTypeEnum.primary"
        :size="SizesEnum.small"
        :disabled="props.confirmDisabled"
        @click.stop="handleConfirmModal"
      >
        {{ props.editing ? 'Сохранить' : 'Да' }}
      </Button>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import Modal from './Modal.vue';
import {
  Button,
  ButtonTypeEnum,
  Checkbox,
  CheckboxCircularEnum,
  SizesEnum
} from '@pksep/yui';
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';
import MobileModal from './MobileModal.vue';

interface IPinConfirmModalProps {
  open: boolean;
  title: string;
  description?: string;
  scopeLabel?: string;
  pinForEveryone?: boolean;
  editing?: boolean;
  confirmDisabled?: boolean;
  commentsEnabled?: boolean;
  comment?: string;
  error?: string;
}

const props = withDefaults(defineProps<IPinConfirmModalProps>(), {
  pinForEveryone: false
});
const { state: isMobile } = useResizeState(MAX_W_MD);

const emits = defineEmits<{
  (e: 'unmount-close'): void;
  (e: 'unmount-confirm'): void;
  (e: 'update:pinForEveryone', value: boolean): void;
  (e: 'update:comment', value: string): void;
}>();

const handleCloseModal = () => {
  emits('unmount-close');
};

const handleConfirmModal = () => {
  if (props.confirmDisabled) return;
  emits('unmount-confirm');
};

const handleUpdatePinForEveryone = (value: boolean | undefined) => {
  emits('update:pinForEveryone', Boolean(value));
};
</script>
