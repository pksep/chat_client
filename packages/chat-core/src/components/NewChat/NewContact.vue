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
      <Search class="new-contact__section-search" />
      <ul class="new-contact__section-list">
        <li class="new-contact__section-list__li">
          <UserProfile
            name="John Doe"
            nickname="@johndoe"
            avatar-url="/avatar-user.png"
            avatar-alt="avatar user"
          />
          <Checkbox
            :size="SizesEnum.small"
            @update:model-value="handleCheckbox"
          />
        </li>
      </ul>
      <Button
        :type="ButtonTypeEnum.primary"
        :size="SizesEnum.little"
        class="new-contact__add"
        :disabled="state.checkUsers.size === 0"
        @click="handleOpenUser"
      >
        Добавить
      </Button>
    </section>
  </Modal>
  <Teleport to="body">
    <KeepAlive>
      <component
        :is="AddUser"
        :open="state.openAddUser"
        @unmount-close="handleCloseAddUser"
      />
    </KeepAlive>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue';
import {
  Checkbox,
  Icon,
  IconNameEnum,
  Modal,
  SizesEnum,
  Search,
  ButtonTypeEnum,
  Button
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
  state.openAddUser = true;
};
</script>
<style scoped>
.new-contact {
  width: 370px;
}

:deep(.modal-yui-kit__modal-content) {
}

.new-contact__header {
  font-size: 16px;
  padding-block: 10px;
  padding-inline: 20px;
  display: flex;
  font-weight: bold;
  align-items: center;
  justify-content: space-between;
  border-bottom-style: solid;
  border-bottom-width: 1px;
  border-bottom-color: var(--border-grey);
}

.new-contact__section-list__li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  padding-inline: 10px;
  margin-top: 5px;
  & .checkbox-yui-kit {
    justify-self: flex-end;
  }
}

.new-contact__section-search {
  padding: 10px;
  margin-bottom: 5px;
}

.new-contact__section-list {
  display: grid;
  gap: 8px;
  padding: 10px;
}

.new-contact__section {
  display: grid;
}

button.button-yui-kit.new-contact__button-close {
  padding-block: 5px;
  padding-inline: 0;
}

button.new-contact__add {
  margin-right: 10px;
  margin-bottom: 10px;
  justify-self: end;
}
</style>
