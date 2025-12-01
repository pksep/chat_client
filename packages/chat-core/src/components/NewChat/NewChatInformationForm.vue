<template>
  <form class="menu__info-form" @submit.prevent="onSubmit">
    <slot> </slot>
    <div class="menu__info-form-block form__name">
      <label for="name" class="menu__info-title-text"> Название: </label>
      <Input id="name" class="initial" placeholder="Text" v-model="form.name" />
    </div>
    <div class="menu__info-form-block form__textarea" v-if="false">
      <label class="menu__info-title-text"> Описание: </label>
      <Textarea class="initial" placeholder="Text" />
    </div>
    <slot name="button">
      <Button
        class="menu__info-save-button"
        :type="ButtonTypeEnum.primary"
        :size="SizesEnum.little"
        :disabled="!isFormValid"
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
import { watch, computed, reactive } from 'vue';

const model = defineModel<IMenuInfoInformation>();

const emits = defineEmits<{
  (e: 'unmount-save', value: { name: string; avatarUrl?: string }): void;
}>();

const form = reactive({
  name: model.value?.name || '',
  avatarUrl: model.value?.avatarUrl || ''
});

const isFormValid = computed(() => {
  if ((model.value?.avatarUrl ?? '') !== form.avatarUrl) {
    return true;
  }
  return (
    form.name &&
    form.name.trim() !== '' &&
    form.name !== (model.value?.name ?? '')
  );
});

watch([() => model.value?.name, () => model.value?.avatarUrl], () => {
  if (model.value) {
    form.name = model.value.name;
    form.avatarUrl = model.value.avatarUrl;
  }
});

const onSave = () => {
  if (isFormValid.value) {
    model.value.name = form.name;
    emits('unmount-save', { name: form.name, avatarUrl: form.avatarUrl });
  }
};

const onSubmit = () => {
  onSave();
};
</script>
