<template>
  <MobileModal
    v-if="isMobile"
    class="vpn-confirm-modal vpn-confirm-modal--mobile"
    headerClass="hidden"
    :show-divider="false"
    :open="props.open"
    :data-testid="`${props.dataTestid}-Mobile`"
    @unmount-close="handleClose"
  >
    <div class="vpn-confirm-modal__title">
      <VpnWarningIcon />
      <h2>Похоже, у вас включён VPN</h2>
    </div>
    <p class="vpn-confirm-modal__description">
      Из-за этого приложение может работать нестабильно. Отключите VPN в
      настройках устройства и попробуйте снова
    </p>
    <Button :type="ButtonTypeEnum.primary" @click.stop="handleOpenSettings">
      Перейти в настройки
    </Button>
    <Button :type="ButtonTypeEnum.secondary" @click.stop="handleClose">
      Закрыть
    </Button>
  </MobileModal>

  <Modal
    v-else
    class="vpn-confirm-modal"
    :open="props.open"
    position="center"
    width="456px"
    @click.stop
  >
    <div class="vpn-confirm-modal__title">
      <VpnWarningIcon />
      <h2>Похоже, у вас включён VPN</h2>
    </div>
    <p class="vpn-confirm-modal__description">
      Из-за этого приложение может работать нестабильно. Отключите VPN в
      настройках устройства и попробуйте снова
    </p>
    <div class="vpn-confirm-modal__buttons">
      <Button
        :type="ButtonTypeEnum.secondary"
        :size="SizesEnum.small"
        @click.stop="handleClose"
      >
        Закрыть
      </Button>
      <Button
        :type="ButtonTypeEnum.primary"
        :size="SizesEnum.small"
        @click.stop="handleOpenSettings"
      >
        Перейти в настройки
      </Button>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { Button, ButtonTypeEnum, Modal, SizesEnum } from '@pksep/yui';
import { useResizeState } from '../../composables/useResizeState';
import VpnWarningIcon from '../../components/UI/VpnWarningIcon.vue';
import { MAX_W_MD } from '../../utils/constants';
import MobileModal from './MobileModal.vue';

const { state: isMobile } = useResizeState(MAX_W_MD);
const props = withDefaults(
  defineProps<{
    dataTestid?: string;
    open: boolean;
  }>(),
  {
    dataTestid: 'VpnConfirmModal'
  }
);

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'open-settings'): void;
}>();

const handleClose = () => {
  emit('close');
};

const handleOpenSettings = () => {
  emit('open-settings');
};
</script>
