<template>
  <Modal
    :open="state.open"
    class="new-contact"
    position="center"
    @close="closeModal"
  >
    <header class="new-contact__header">
      Добавить участника
      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        @click="closeModal"
        class="new-contact__button-close"
      >
        <Icon :name="IconNameEnum.crossLarge" />
      </Button>
    </header>
    <section class="new-contact__section">
      <Search class="new-contact__search" />
      <ul class="new-contact__list">
        <li class="new-contact__item">
          <UserProfile
            name="John Doe"
            nickname="@johndoe"
            avatar-url="/avatar-user.png"
            avatar-alt="avatar user"
          />
          <Checkbox
            :size="CheckboxSizeEnum.small"
            @update:model-value="handleCheckbox"
          />
        </li>
      </ul>
      <Button
        :type="ButtonTypeEnum.primary"
        :size="SizesEnum.little"
        class="new-contact__add"
        :disabled="isButtonDisabled"
        @click="handleOpenUser"
      >
        Добавить
      </Button>
    </section>
  </Modal>
  <KeepAlive>
    <component
      :is="AddUser"
      :open="state.openAddUser"
      @unmount-close="handleCloseAddUser"
    />
  </KeepAlive>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import {
  Checkbox,
  Icon,
  IconNameEnum,
  Modal,
  SizesEnum,
  Search,
  ButtonTypeEnum,
  Button,
  CheckboxSizeEnum
} from 'sep-yui';
import UserProfile from '../UserProfile/UserProfile.vue';
import AddUser from './AddUser.vue';

const props = withDefaults(defineProps<{ open: boolean }>(), {
  open: false
});

const emits = defineEmits<{
  (e: 'unmount-close'): void;
}>();

const state = reactive({
  open: false,
  checkUsers: new Set(),
  openAddUser: false
});

const isButtonDisabled = computed(() => state.checkUsers.size === 0);

watch(
  () => props.open,
  () => {
    state.open = props.open;
  }
);

watch(
  () => state.openAddUser,
  () => {
    state.open = !state.openAddUser;
  }
);

const closeModal = (): void => {
  state.open = false;
  state.openAddUser = false;
  emits('unmount-close');
};

const handleCheckbox = (isCheck: boolean): void => {
  state.checkUsers.add(isCheck);
};

const handleCloseAddUser = (): void => {
  state.openAddUser = false;
};

const handleOpenUser = (): void => {
  if (isButtonDisabled.value) return;
  state.openAddUser = true;
};
</script>

<style></style>
