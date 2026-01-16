<template>
  <section
    class="contact-selector"
    :data-testid="`${props.dataTestid}-ContactSelector-Container`"
  >
    <Search
      class="contact-selector__search"
      v-model="state.q"
      :data-testid="`${props.dataTestid}-ContactSelector-Search`"
    />
    <ul
      class="contact-selector__list"
      :data-testid="`${props.dataTestid}-ContactSelector-List`"
    >
      <li
        v-for="(contact, index) in contacts"
        :key="contact.id"
        class="contact-selector__item"
        @click="handleNewContact(contact)"
        :data-testid="`${props.dataTestid}-ContactSelector-Item${index + 1}`"
      >
        <UserProfile
          :user="contact"
          :dataTestid="`${props.dataTestid}-ContactSelector-UserProfile${index + 1}`"
        />
        <Checkbox
          v-if="!props.isAddOne"
          @click.stop
          :size="CheckboxSizeEnum.small"
          @update:model-value="value => handleCheckbox(value, contact.id)"
          :model-value="state.selectedIds.has(contact.id)"
          :data-testid="`${props.dataTestid}-ContactSelector-Checkbox${index + 1}`"
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
      :data-testid="`${props.dataTestid}-ContactSelector-AddButton`"
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
import { IUser } from '../interfaces/interfaces';
import {
  IContactSelectorProps,
  IContactSelectorEmits,
  IContactSelectorState
} from './interfaces/contact-selector';
import { getUsersList } from '../../composables/useUsers';
import { getAuthUser } from '../../composables/useAuth';

const props = withDefaults(defineProps<IContactSelectorProps>(), {
  dataTestid: () => 'ContactSelector'
});
const emits = defineEmits<IContactSelectorEmits>();

const state = reactive<IContactSelectorState>({
  q: '',
  selectedIds: props.selectedContactIds ?? new Set()
});

const users = computed(() => getUsersList());
const authUser = computed(() => getAuthUser());

const allContacts = computed(() => {
  const userList = [...users.value];

  if (
    authUser.value &&
    !userList.some(user => user.id === authUser.value?.id)
  ) {
    userList.push(authUser.value);
  }

  return userList;
});

const contacts = computed(() =>
  allContacts.value.filter(
    contact =>
      contact.initials.toLowerCase().includes(state.q.toLowerCase()) ||
      contact.nickname.toLowerCase().includes(state.q.toLowerCase())
  )
);

/*
const selectedContacts = computed(() =>
  users.value.filter(contact => state.selectedIds.has(contact.id))
);
 */

const isButtonEnabled = computed(() =>
  props.isButtonDisabled !== undefined
    ? !props.isButtonDisabled && !props.isAddOne
    : !props.isAddOne
);

const isButtonDisabled = computed(() => state.selectedIds.size === 0);

const updateSelection = (
  contactId: string | number,
  shouldAdd: boolean
): void => {
  if (shouldAdd) {
    state.selectedIds.add(contactId);
  } else {
    state.selectedIds.delete(contactId);
  }
  if (props.isButtonDisabled) {
    onAddClick();
  }
};

const handleCheckbox = (isCheck: boolean, contactId: string | number): void => {
  updateSelection(contactId, isCheck);
};

const handleNewContact = (user: IUser): void => {
  if (props.isAddOne) {
    emits('unmount-contact', user);
    return;
  }
  // const shouldAdd = !state.selectedIds.has(contact.id);
  // updateSelection(contact.id, shouldAdd);
};

const selectedContacts = computed(() =>
  allContacts.value.filter(contact => state.selectedIds.has(contact.id))
);

const onAddClick = (): void => {
  emits('unmount-contact', selectedContacts.value);
};
</script>
