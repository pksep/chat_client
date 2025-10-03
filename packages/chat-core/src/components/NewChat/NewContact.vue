<template>
  <Modal :open="state.open" class="new-contact" position="center">
    <header class="new-contact__header">
      Добавить участника
      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        @click="closeModal"
      >
        <Icon :name="IconNameEnum.crossLarge" />
      </Button>
    </header>
    <section class="new-contact__section">
      <Search class="new-contact__section-search" />
      <ul class="new-contact__section-list">
        <li class="new-contact__section-list__li">
          <UserProfile />
          <Checkbox :size="SizesEnum.small" />
        </li>
      </ul>
    </section>
  </Modal>
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

const props = withDefaults(defineProps<{ open: boolean }>(), {
  open: false
});

const state = reactive({
  open: false
});

watch(
  () => props.open,
  () => {
    state.open = props.open;
  }
);

const closeModal = (): void => {
  state.open = false;
};
</script>
<style scoped>
.new-contact {
  width: 370px;
}

.new-contact__header {
  font-size: 16px;
  padding: 10px;
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
</style>
