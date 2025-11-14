<template>
  <section class="contact-selector">
    <Search class="contact-selector__search" />
    <ul class="contact-selector__list">
      <li
        v-for="contact in contacts"
        :key="contact.id"
        class="contact-selector__item"
        @click="handleNewContact(contact)"
      >
        <UserProfile
          :name="contact.name"
          :nickname="contact.nickname"
          :avatar-url="contact.avatarUrl"
          :avatar-alt="contact.avatarAlt"
        />
        <Checkbox
          v-if="!props.isAddOne"
          :size="CheckboxSizeEnum.small"
          @update:model-value="value => handleCheckbox(value, contact.id)"
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
import { computed } from 'vue';
import {
  Checkbox,
  Search,
  ButtonTypeEnum,
  Button,
  CheckboxSizeEnum,
  SizesEnum
} from 'sep-yui';
import UserProfile from '../UserProfile/UserProfile.vue';
import type { IUserProps } from '../interfaces/interfaces';

interface IContactSelectorProps {
  contacts: IUserProps[];
  selectedContactIds: Set<string | number>;
  isAddOne?: boolean;
}

interface IContactSelectorEmits {
  (e: 'contact-select', contact: IUserProps): void;
  (e: 'checkbox-change', isCheck: boolean, contactId: string | number): void;
  (e: 'add-click'): void;
}

const props = defineProps<IContactSelectorProps>();
const emits = defineEmits<IContactSelectorEmits>();

const isButtonDisabled = computed(() => {
  if (props.isAddOne) {
    return false;
  }
  return props.selectedContactIds.size === 0;
});

const handleCheckbox = (isCheck: boolean, contactId: string | number): void => {
  emits('checkbox-change', isCheck, contactId);
};

const handleNewContact = (contact: IUserProps): void => {
  if (props.isAddOne) {
    emits('contact-select', contact);
  } else {
    const isCurrentlySelected = props.selectedContactIds.has(contact.id);
    handleCheckbox(!isCurrentlySelected, contact.id);
  }
};

const onAddClick = (): void => {
  emits('add-click');
};
</script>

<style scoped>
.contact-selector {
}

.contact-selector__search {
  margin-bottom: 1rem;
}

.contact-selector__list {
  max-height: 300px;
  overflow-y: auto;
  margin-bottom: 1rem;
}

.contact-selector__item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  cursor: pointer;
}

.contact-selector__item:hover {
  background-color: #f5f5f5;
}

.contact-selector__add {
  width: 100%;
}
</style>
