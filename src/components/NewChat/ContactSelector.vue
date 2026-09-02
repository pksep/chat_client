<template>
  <section
    class="contact-selector"
    :data-testid="`${props.dataTestid}-ContactSelector-Container`"
  >
    <div v-if="selectedContacts.length" class="contact-selector__badges">
      <Badges
        v-for="contact in selectedContacts"
        :key="contact.id"
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

    <div
      class="contact-selector__filters"
      :data-testid="`${props.dataTestid}-ContactSelector-Filters`"
    >
      <button
        v-for="filter in contactFilters"
        :key="filter.value"
        type="button"
        class="contact-selector__filter"
        :class="{
          'contact-selector__filter--active': state.filter === filter.value
        }"
        :data-testid="`${props.dataTestid}-ContactSelector-Filter-${filter.value}`"
        @click="state.filter = filter.value"
      >
        {{ filter.label }}
      </button>
    </div>

    <ul
      v-if="contacts.length"
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

    <div
      v-else
      class="contact-selector__empty"
      :data-testid="`${props.dataTestid}-ContactSelector-Empty`"
    >
      <p class="contact-selector__empty-title">Результаты не найдены</p>
      <img
        class="contact-selector__empty-image"
        src="/images/not-found-contact.svg"
        alt="Результаты не найдены"
      />
    </div>
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
import {
  matchesUserSearch,
  normalizeAtSearchQuery
} from '../../utils/searchMatch';
import { isBotUser, isCallBotUser } from '../../utils/bot';

type ContactSelectorFilter = IContactSelectorState['filter'];

const props = withDefaults(defineProps<IContactSelectorProps>(), {
  dataTestid: () => 'ContactSelector'
});
const emits = defineEmits<IContactSelectorEmits>();

const state = reactive<IContactSelectorState>({
  q: '',
  filter: 'users',
  selectedIds: props.selectedContactIds ?? new Set()
});
const contactFilters: Array<{
  label: string;
  value: ContactSelectorFilter;
}> = [
  { label: 'Пользователи', value: 'users' },
  { label: 'Боты', value: 'bots' }
];

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
  const query = normalizeAtSearchQuery(state.q);

  if (query) {
    filteredContacts = filteredContacts.filter(contact =>
      matchesUserSearch(contact, query)
    );
  }

  filteredContacts = filteredContacts.filter(contact => {
    const isBot = isBotUser(contact);
    return state.filter === 'bots' ? isBot : !isBot;
  });

  if (props.excludedContactIds && props.excludedContactIds.size > 0) {
    filteredContacts = filteredContacts.filter(
      contact => !props.excludedContactIds.has(contact.id)
    );
  }

  filteredContacts = filteredContacts.filter(
    contact => contact.id !== authUser.value.id && !isCallBotUser(contact)
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

.contact-selector__filters {
  display: flex;
  gap: 8px;
  padding: 0 10px 8px;
}

.contact-selector__filter {
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid var(--border-table);
  border-radius: 17px;
  color: var(--text-primary);

  background: var(--surface-overlay);
  font-size: 14px;
  font-weight: 500;
  line-height: 18px;
  cursor: pointer;
}

.contact-selector__filter--active {
  border-color: var(--action-primary-bg);
  color: var(--action-primary-bg);
}
</style>
