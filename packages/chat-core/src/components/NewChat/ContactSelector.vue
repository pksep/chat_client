<template>
  <section class="contact-selector">
    <Search class="contact-selector__search" />
    <Input v-model="name" />
    <ul class="contact-selector__list">
      <li
        v-for="contact in props.contacts"
        :key="contact.userID"
        class="contact-selector__item"
        @click="handleNewContact(contact)"
      >
        <UserProfile
          :name="contact.nickname"
          :nickname="contact.nickname"
          :avatar-alt="contact.nickname"
        />
        <Checkbox
          v-if="!props.isAddOne"
          @click.stop
          :size="CheckboxSizeEnum.small"
          @update:model-value="value => handleCheckbox(value, contact.userID)"
          :model-value="props.selectedContactIds.has(contact.userID)"
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
  Search,
  ButtonTypeEnum,
  Button,
  CheckboxSizeEnum,
  SizesEnum,
  Input
} from '@pksep/yui';
import UserProfile from '../UserProfile/UserProfile.vue';
import { User } from '../../composables/useUsers';

interface IContactSelectorProps {
  contacts: User[];
  selectedContactIds: Set<string | number>;
  isAddOne?: boolean;
}

interface IContactSelectorEmits {
  (e: 'contact-select', contact: User): void;
  (e: 'checkbox-change', isCheck: boolean, contactId: string | number): void;
  (e: 'add-click', name?: string): void;
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
  emits('checkbox-change', isCheck, contactId);
};

const handleNewContact = (contact: User): void => {
  if (props.isAddOne) {
    emits('contact-select', contact);
  } else {
    const isCurrentlySelected = props.selectedContactIds.has(contact.userID);
    handleCheckbox(!isCurrentlySelected, contact.userID);
  }
};

const onAddClick = (): void => {
  emits('add-click', name.value);
};
</script>
