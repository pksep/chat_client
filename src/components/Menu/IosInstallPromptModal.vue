<template>
  <MobileModal
    class="ios-install-modal"
    :open="props.open"
    :show-divider="false"
    :data-testid="`${props.dataTestid}-IosInstallPromptModal`"
    @unmount-close="handleIgnoreClose"
  >
    <template #header>
      <div class="ios-install-modal__header-side" />
      <h3 class="mobile__modal-header--title ios-install-modal__header-title">
        Установка на iPhone
      </h3>
      <div class="ios-install-modal__header-side" />
    </template>

    <section class="ios-install-modal__hero">
      <div class="ios-install-modal__icon-shell">
        <AppleIcon />
      </div>

      <div class="ios-install-modal__copy">
        <h2 class="ios-install-modal__title">
          Добавьте приложение на экран домой
        </h2>
        <p class="ios-install-modal__description">
          На iOS установка PWA запускается вручную через Safari, поэтому мы
          показываем пошаговую инструкцию.
        </p>
      </div>
    </section>

    <ol class="ios-install-modal__steps">
      <li class="ios-install-modal__step">Откройте эту страницу в Safari.</li>
      <li class="ios-install-modal__step">Нажмите кнопку «Поделиться».</li>
      <li class="ios-install-modal__step">Выберите пункт «На экран Домой».</li>
      <li class="ios-install-modal__step">
        Подтвердите добавление кнопкой «Добавить».
      </li>
    </ol>

    <Button
      :type="ButtonTypeEnum.primary"
      :size="SizesEnum.small"
      @click="emits('close')"
    >
      Понятно
    </Button>
  </MobileModal>
</template>

<script setup lang="ts">
import { Button, ButtonTypeEnum, SizesEnum } from '@pksep/yui';
import AppleIcon from '../UI/AppleIcon.vue';
import MobileModal from '../UI/MobileModal.vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    dataTestid?: string;
  }>(),
  {
    dataTestid: 'Menu'
  }
);

const emits = defineEmits<{
  (e: 'close'): void;
}>();

const handleIgnoreClose = (): void => {};
</script>

<style scoped>
.ios-install-modal :deep(.modal-yui-kit__modal-content) {
  gap: 0;
  padding: 0;
}

.ios-install-modal :deep(.modal-yui-kit__modal),
.ios-install-modal :deep(.modal-yui-kit__modal-content) {
  border-top-left-radius: 0 !important;
  border-top-right-radius: 0 !important;
}

.ios-install-modal__hero {
  display: grid;
  gap: 16px;
  padding: 8px 16px 0;
}

.ios-install-modal__header-side {
  width: 20%;
}

.ios-install-modal__header-title {
  width: 60%;
  max-width: 60%;
}

.ios-install-modal__icon-shell {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: linear-gradient(135deg, #1f2937, #111827);
  box-shadow: 0 12px 24px rgb(17 24 39 / 18%);
}

.ios-install-modal__copy {
  display: grid;
  gap: 8px;
}

.ios-install-modal__title {
  margin: 0;

  font-size: 20px;
  line-height: 1.2;
}

.ios-install-modal__description {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.45;
}

.ios-install-modal__steps {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 20px 16px 0 36px;
}

.ios-install-modal__step {
  padding-left: 4px;
  line-height: 1.45;
}

.ios-install-modal button.button-yui-kit {
  margin: 20px 16px 16px;
}
</style>
