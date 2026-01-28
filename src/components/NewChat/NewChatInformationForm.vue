<template>
  <form class="menu__info-form" @submit.prevent="onSubmit">
    <slot> </slot>
    <div class="menu__info-form-block form__name">
      <label for="name" class="menu__info-title-text"> Название: </label>
      <Input
        id="name"
        class="initial"
        placeholder="Text"
        v-model="form.name"
        :disabled="props.disabledForm"
      />
    </div>
    <div class="menu__info-form-block form__textarea" v-if="false">
      <label class="menu__info-title-text"> Описание: </label>
      <Textarea class="initial" placeholder="Text" />
    </div>
    <slot name="button">
      <Button
        v-if="props.isButtonForSave"
        class="menu__info-save-button"
        :type="ButtonTypeEnum.primary"
        :size="SizesEnum.little"
        :disabled="!isFormValid || props.disabledForm"
        @click="onSave"
      >
        Сохранить
      </Button>
    </slot>
  </form>
</template>

<script setup lang="ts">
import { IMenuInfoInformation } from '../../composables/useMenuInfo';
import { Button, ButtonTypeEnum, Input, SizesEnum, Textarea } from '@pksep/yui';
import { computed } from 'vue';
import { useNewInformationModal } from '../../composables/useNewInformationModal';

const props = withDefaults(
  defineProps<{
    disabledForm?: boolean;
    isButtonForSave?: boolean;
  }>(),
  {
    isButtonForSave: true
  }
);

const model = defineModel<IMenuInfoInformation>();

const emits = defineEmits<{
  (e: 'unmount-save', value: { name: string; avatarUrl?: string }): void;
}>();

const { form } = useNewInformationModal(model?.value || {});

const isFormValid = computed(() => {
  if (props.disabledForm) return true;
  if ((model.value?.avatarUrl ?? '') !== form.avatarUrl) {
    return true;
  }
  return (
    form.name &&
    form.name.trim() !== '' &&
    form.name !== (model.value?.name ?? '')
  );
});

const onSave = () => {
  if (isFormValid.value) {
    model.value = {
      ...model.value,
      name: form.name,
      avatarUrl: form.avatarUrl
    };
    emits('unmount-save', { name: form.name, avatarUrl: form.avatarUrl });
  }
};

const onSubmit = () => {
  onSave();
};
</script>
