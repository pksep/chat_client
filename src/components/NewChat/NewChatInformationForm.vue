<template>
  <form class="menu__info-form" @submit.prevent="onSubmit">
    <slot> </slot>
    <div class="menu__info-form-block form__name">
      <label for="name" class="menu__info-title-text"> Название: </label>
      <Input
        @click.stop
        id="name"
        class="initial"
        placeholder="Text"
        :model-value="newName"
        @update:model-value="handleChangeName"
        :disabled="!!currentGroup && !currentGroup.isAdmin"
      />
    </div>
    <div class="menu__info-form-block form__textarea" v-if="false">
      <label class="menu__info-title-text"> Описание: </label>
      <Textarea class="initial" placeholder="Text" />
    </div>
    <slot name="button">
      <Button
        v-if="!currentGroup || currentGroup.isAdmin"
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
import { currentGroup } from '../../composables/useGroup';
import { useUrlWatcher } from '../../composables/navigation';

const emits = defineEmits<{
  (e: 'unmount-save', value: { name: string }): void;
  (e: 'unmount-change', value: { name: string }): void;
}>();

const route = useUrlWatcher();

const props = withDefaults(
  defineProps<{
    name?: string;
  }>(),
  { name: '' }
);

const oldName = ref(props.name);
const newName = ref(props.name);

const isFormValid = computed(() => {
  return newName.value?.trim() !== '' && newName.value !== oldName.value;
});

const onSave = () => {
  if (isFormValid.value) {
    currentGroup.value = {
      ...currentGroup.value,
      name: newName.value
    };
    oldName.value = newName.value;
    emits('unmount-save', { name: newName.value });
  }
};

const onSubmit = () => {
  onSave();
};

const handleChangeName = (newVal: string) => {
  newName.value = newVal;
  emits('unmount-change', { name: newName.value });
};

watch(
  () => [currentGroup.value?.id, route.value.id],
  () => {
    newName.value = currentGroup.value?.name || props.name;
  },
  { immediate: true }
);
</script>
