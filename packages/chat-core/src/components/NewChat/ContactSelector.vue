<template>
  <section class="contact-selector">
    <Search v-model="q" />
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
          :model-value="localSelectedIds.has(contact.id)"
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

interface IContactSelectorProps {
  contacts: IUserProps[];
  selectedContactIds?: Set<string | number>;
  isAddOne?: boolean;
}

interface IContactSelectorEmits {
  (e: 'unmount-contact', contact: IUserProps[] | IUserProps): void;
}

const props = defineProps<IContactSelectorProps>();
const emits = defineEmits<IContactSelectorEmits>();

const q = defineModel<string>('');

const localSelectedIds = reactive(
  new Set<string | number>(props.selectedContactIds)
);

const contacts = computed(() =>
  props.contacts.filter(
    contact =>
      (contact.ex?.toLowerCase() ?? '').includes(
        (q.value ?? '').toLowerCase()
      ) ||
      (contact.nickname?.toLowerCase() ?? '').includes(
        (q.value ?? '').toLowerCase()
      )
  )
);

const selectedContacts = computed(() =>
  props.contacts.filter(contact => localSelectedIds.has(contact.id))
);

const isButtonDisabled = computed(() => {
  if (props.isAddOne) {
    return false;
  }
  return localSelectedIds.size === 0;
});

const handleCheckbox = (isCheck: boolean, contactId: string | number): void => {
  if (isCheck) {
    localSelectedIds.add(contactId);
  } else {
    localSelectedIds.delete(contactId);
  }
};

const handleNewContact = (contact: IUserProps): void => {
  if (props.isAddOne) {
    emits('unmount-contact', contact);
  }
};

const onAddClick = (): void => {
  emits('unmount-contact', selectedContacts.value);
};
</script>
