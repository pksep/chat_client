<template>
  <section
    class="contact-selector"
    :data-testid="`${props.dataTestid}-ContactSelector-Container`"
  >
    <div class="contact-selector__badges">
      <Badges
        v-for="contact in selectedContacts"
        :text="contact.initials"
        :type="BadgesTypeEnum.blue"
        @remove="updateSelection(contact.id, false)"
        choosed
      />
    </div>
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
        :class="{
          'contact-selector__item--excluded': isContactExcluded(contact.id)
        }"
        @click="!isContactExcluded(contact.id) && handleNewContact(contact)"
        :data-testid="`${props.dataTestid}-ContactSelector-Item${index + 1}`"
      >
        <UserProfile
          :user="contact"
          :dataTestid="`${props.dataTestid}-ContactSelector-UserProfile${index + 1}`"
          :class="{ 'user-profile--excluded': isContactExcluded(contact.id) }"
        />
        <div
          v-if="isContactExcluded(contact.id)"
          class="contact-selector__excluded-indicator"
          :data-testid="`${props.dataTestid}-ContactSelector-ExcludedIndicator${index + 1}`"
        >
          Добавлен
        </div>
        <Checkbox
          v-else-if="!props.isAddOne"
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
  Search,
  BadgesTypeEnum,
  Badges
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

const contacts = computed(() => {
  let filteredContacts = allContacts.value;

  filteredContacts = filteredContacts.filter(
    contact =>
      contact.initials.toLowerCase().includes(state.q.toLowerCase()) ||
      contact.nickname.toLowerCase().includes(state.q.toLowerCase()) ||
      JSON.parse(contact.ex as string)
        ?.erpInitials?.toLowerCase()
        .includes(state.q.toLowerCase())
  );

  if (props.excludedContactIds && props.excludedContactIds.size > 0) {
    filteredContacts = filteredContacts.filter(
      contact => !props.excludedContactIds.has(contact.id)
    );
  }

  filteredContacts = filteredContacts.filter(
    contact => contact.id !== authUser.value.id
  );

  return [...filteredContacts];
});

const selectedContacts = computed(() => {
  const filteredContacts = users.value.filter(contact =>
    state.selectedIds.has(contact.id)
  );
  return [...filteredContacts];
});

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

  emits('unmount-select-contact', selectedContacts.value);
};

const handleCheckbox = (isCheck: boolean, contactId: string | number): void => {
  updateSelection(contactId, isCheck);
};

const handleNewContact = (user: IUser): void => {
  if (props.isAddOne) {
    emits('unmount-contact', user);
    return;
  }
  const shouldAdd = !state.selectedIds.has(user.id);
  updateSelection(user.id, shouldAdd);
};

const isContactExcluded = (contactId: string | number): boolean => {
  if (props.excludedContactIds && props.excludedContactIds.has(contactId)) {
    return true;
  }
  return false;
};

const onAddClick = (): void => {
  emits('unmount-contact', selectedContacts.value);
};
</script>

<style scoped>
.contact-selector__item--excluded {
  opacity: 0.6;
  background-color: #f5f5f5;
  cursor: not-allowed;
}

.contact-selector__excluded-indicator {
  margin-left: auto;
  padding: 4px 8px;
  background-color: #e0e0e0;
  border-radius: 4px;
  font-size: 0.8em;
  color: #666;
}

.user-profile--excluded {
  opacity: 0.7;
}
</style>
