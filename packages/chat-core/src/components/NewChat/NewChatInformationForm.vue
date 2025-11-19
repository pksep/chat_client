<template>
  <form class="menu__info-form" @submit.prevent="onSubmit">
    <slot> </slot>
    <div class="menu__info-form-block form__name">
      <label for="name" class="menu__info-title-text"> Название: </label>
      <Input
        id="name"
        class="initial"
        placeholder="Text"
        v-model="model.name"
      />
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
import { Button, ButtonTypeEnum, Input, SizesEnum, Textarea } from '@pksep/yui';
import { computed, ref, watch } from 'vue';

const model = defineModel<{ name: string }>();

const emits = defineEmits<{
  (e: 'unmount-save', value: { name: string }): void;
}>();

const initialName = ref(model.value?.name || '');

watch(
  () => model.value?.name,
  newName => {
    if (newName) {
      initialName.value = newName;
    }
  }
);

const isFormValid = computed(() => {
  return (
    model.value?.name &&
    model.value.name.trim() !== '' &&
    model.value.name !== initialName.value
  );
});

const onSave = () => {
  if (isFormValid.value) {
    emits('unmount-save', { name: model.value.name });
  }
};

const onSubmit = () => {
  onSave();
};
</script>
