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
import { computed, reactive } from 'vue';

const model = defineModel<IMenuInfoInformation>({
  default: { name: '' }
});

const emits = defineEmits<{
  (e: 'unmount-save', value: { name: string }): void;
}>();

const form = reactive({ name: model.value?.name || '' });

const isFormValid = computed(() => {
  return (
    form.name && form.name.trim() !== '' && form.name !== model.value?.name
  );
});

const onSave = () => {
  if (isFormValid.value) {
    model.value.name = form.name;
    emits('unmount-save', { name: form.name });
  }
};

const onSubmit = () => {
  onSave();
};
</script>
