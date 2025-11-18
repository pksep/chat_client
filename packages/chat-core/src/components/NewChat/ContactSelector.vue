<template>
  <section class="contact-selector">
    <Input class="contact-selector__search" placeholder="Название:" v-model="name" />
    <ul class="contact-selector__list">
      <li
        v-for="contact in props.contacts"
        :key="contact.id"
        class="contact-selector__item"
        @click="handleNewContact(contact)"
      >
        <UserProfile
          :name="contact.name"
          :nickname="contact.nickname"
          :avatar-alt="contact.nickname"
        />
        <Checkbox
          v-if="!props.isAddOne"
          @click.stop
          :size="CheckboxSizeEnum.small"
          @update:model-value="value => handleCheckbox(value, contact.id)"
          :model-value="props.selectedContactIds.has(contact.id)"
        />
      </li>
    </ul>
    <Button
      v-if="!props.isAddOne"
      :type="ButtonTypeEnum.primary"
      :size="SizesEnum.little"
      class="contact-selector__add"
      :disabled="isButtonDisabled"
      @click="onAddClick"
    >
      Добавить
    </Button>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  Checkbox,
  Input,
  ButtonTypeEnum,
  Button,
  CheckboxSizeEnum,
  SizesEnum
} from '@pksep/yui';
import UserProfile from '../UserProfile/UserProfile.vue';
import { IUserProps } from '../interfaces/interfaces';

interface IContactSelectorProps {
  contacts: IUserProps[];
  selectedContactIds: Set<string | number>;
  isAddOne?: boolean;
}

interface IContactSelectorEmits {
  (e: 'unmount-contact', contact: IUserProps): void;
  (e: 'unmount-checkbox', isCheck: boolean, contactId: string | number): void;
  (e: 'unmount-click', name?: string): void;
}

const props = defineProps<IContactSelectorProps>();
const emits = defineEmits<IContactSelectorEmits>();

const name = ref('');

const isButtonDisabled = computed(() => {
  if (props.isAddOne) {
    return false;
  }
  return props.selectedContactIds.size < 2 || !name.value;
});

const handleCheckbox = (isCheck: boolean, contactId: string | number): void => {
  emits('unmount-checkbox', isCheck, contactId);
};

const handleNewContact = (contact: IUserProps): void => {
  if (props.isAddOne) {
    emits('unmount-contact', contact);
  } else {
    const isCurrentlySelected = props.selectedContactIds.has(contact.id);
    handleCheckbox(!isCurrentlySelected, contact.id);
  }
};

const onAddClick = (): void => {
  emits('unmount-click', name.value);
};
</script>
