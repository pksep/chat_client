<template>
  <section class="contact-selector">
    <Search v-model="state.q" />
    <ul class="contact-selector__list">
      <li
        v-for="contact in contacts"
        :key="contact.id"
        class="contact-selector__item"
        @click="handleNewContact(contact)"
      >
        <UserProfile
          :tabel="contact.tabel"
          :nickname="contact.nickname"
          :avatar-alt="contact.nickname"
        />
        <Checkbox
          v-if="!props.isAddOne"
          @click.stop
          :size="CheckboxSizeEnum.small"
          @update:model-value="value => handleCheckbox(value, contact.id)"
          :model-value="state.selectedIds.has(contact.id)"
        />
      </li>
    </ul>
    <Button
      v-if="isButtonEnabled"
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
import { computed, reactive } from 'vue';
import {
  Checkbox,
  ButtonTypeEnum,
  Button,
  CheckboxSizeEnum,
  SizesEnum,
  Search
} from '@pksep/yui';
import UserProfile from '../UserProfile/UserProfile.vue';
import { IUserProps } from '../interfaces/interfaces';
import {
  IContactSelectorProps,
  IContactSelectorEmits,
  IContactSelectorState
} from './interfaces/contact-selector';

const props = defineProps<IContactSelectorProps>();
const emits = defineEmits<IContactSelectorEmits>();

const state = reactive<IContactSelectorState>({
  q: '',
  selectedIds: props.selectedContactIds ?? new Set()
});

const contacts = computed(() =>
  props.contacts.filter(
    contact =>
      (contact.ex?.toLowerCase() ?? '').includes(
        (state.q ?? '').toLowerCase()
      ) ||
      (contact.nickname?.toLowerCase() ?? '').includes(
        (state.q ?? '').toLowerCase()
      )
  )
);

const selectedContacts = computed(() =>
  props.contacts.filter(contact => state.selectedIds.has(contact.id))
);

const isButtonEnabled = computed(() =>
  props.isButtonDisabled !== undefined
    ? !props.isButtonDisabled && !props.isAddOne
    : !props.isAddOne
);

const isButtonDisabled = computed(() => state.selectedIds.size === 0);

const handleCheckbox = (isCheck: boolean, contactId: string | number): void => {
  if (isCheck) {
    state.selectedIds.add(contactId);
  } else {
    state.selectedIds.delete(contactId);
  }
};

const handleNewContact = (contact: IUserProps): void => {
  if (props.isAddOne) {
    emits('unmount-contact', contact);
    return;
  }
  if (props.isButtonDisabled) {
    emits('unmount-contact', selectedContacts.value);
  }
};

const onAddClick = (): void => {
  emits('unmount-contact', selectedContacts.value);
};
</script>
