<template>
  <MobileModal
    v-if="isMobile"
    class="confirm__modal__mobile confirm__modal__mobile--pin"
    headerClass="hidden"
    :show-divider="false"
    :open="props.open"
    @unmount-close="handleCloseModal"
  >
    <h2 class="confirm__modal__title">{{ props.title }}</h2>
    <p class="confirm__modal__description">
      {{ props.description }}
    </p>
    <label class="confirm__modal__scope" @click.stop>
      <Checkbox
        :model-value="props.pinForEveryone"
        :circular="CheckboxCircularEnum.circled"
        @update:model-value="handleUpdatePinForEveryone"
      />
      <span>{{ props.scopeLabel }}</span>
    </label>
    <Button :type="ButtonTypeEnum.primary" @click.stop="handleCloseModal">
      Нет
    </Button>
    <Button :type="ButtonTypeEnum.secondary" @click.stop="handleConfirmModal">
      Да
    </Button>
  </MobileModal>

  <Modal
    v-else
    :open="props.open"
    position="center"
    width="492px"
    class="confirm__modal confirm__modal--pin"
    @click.stop
  >
    <h2 class="confirm__modal__title">{{ props.title }}</h2>
    <p class="confirm__modal__description">
      {{ props.description }}
    </p>
    <label class="confirm__modal__scope" @click.stop>
      <Checkbox
        :model-value="props.pinForEveryone"
        :circular="CheckboxCircularEnum.circled"
        @update:model-value="handleUpdatePinForEveryone"
      />
      <span>{{ props.scopeLabel }}</span>
    </label>
    <div class="confirm__modal__buttons">
      <Button
        :type="ButtonTypeEnum.secondary"
        :size="SizesEnum.small"
        @click.stop="handleCloseModal"
      >
        Нет
      </Button>
      <Button
        :type="ButtonTypeEnum.primary"
        :size="SizesEnum.small"
        @click.stop="handleConfirmModal"
      >
        Да
      </Button>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import {
  Button,
  ButtonTypeEnum,
  Checkbox,
  CheckboxCircularEnum,
  Modal,
  SizesEnum
} from '@pksep/yui';
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';
import MobileModal from './MobileModal.vue';

interface IPinConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  scopeLabel: string;
  pinForEveryone: boolean;
}

const props = defineProps<IPinConfirmModalProps>();
const { state: isMobile } = useResizeState(MAX_W_MD);

const emits = defineEmits<{
  (e: 'unmount-close'): void;
  (e: 'unmount-confirm'): void;
  (e: 'update:pinForEveryone', value: boolean): void;
}>();

const handleCloseModal = () => {
  emits('unmount-close');
};

const handleConfirmModal = () => {
  emits('unmount-confirm');
};

const handleUpdatePinForEveryone = (value: boolean | undefined) => {
  emits('update:pinForEveryone', Boolean(value));
};
</script>
