<template>
  <aside :class="menuInfoClasses" v-if="props.open">
    <header class="menu-info__header">
      <h4>Общий</h4>
      <Button
        class="menu-info__close-button"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        @click="handleCloseMenu"
      >
        <Icon :name="IconNameEnum.crossLarge" class="menu-info__close-icon" />
      </Button>
    </header>
    <Tabs :tabCount="2">
      <template #header1>
        <span class="menu-info__user-header">
          Участники
          <div class="menu-info__user-count">8</div>
        </span>
      </template>
      <template #header2> Информация </template>
      <template #tab1>
        <ContactListInModal @unmount-user-add="unmountUserAdd" />
      </template>
      <template #tab2>
        <section class="menu-info__info-section">
          <slot name="information-menu">
            <div class="menu-info__create-channel">
              <p class="menu-info__title-text">Канал создан:</p>
              <span>
                {{ new Date().toLocaleDateString('ru-RU') }}
              </span>
            </div>
            <button
              class="menu-info__avatar-button"
              @click="openEditProfileIcon"
            >
              <Avatar is-icon />
            </button>
            <Teleport to="body">
              <ModalCroppedAvatar
                :image="null"
                :open="state.isEditAvatar"
                @unmount-close="closeEditProfileIcon"
              />
            </Teleport>
            <div class="menu-info__buttons">
              <Button
                :type="ButtonTypeEnum.secondary"
                :size="SizesEnum.large"
                class="menu-info__secondary-button"
              >
                <Icon :name="IconNameEnum.noDistrub" />
                Звук выкл.
              </Button>
              <Button
                :type="ButtonTypeEnum.secondary"
                :size="SizesEnum.large"
                class="menu-info__secondary-button"
              >
                <Icon :name="IconNameEnum.logout" />
                Выйти
              </Button>
            </div>
            <NewChatInformationForm />
          </slot>
        </section>
      </template>
    </Tabs>
  </aside>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, reactive, watch } from 'vue';
import {
  Tabs,
  ModalCroppedAvatar,
  Button,
  ButtonTypeEnum,
  IconNameEnum,
  SizesEnum,
  Icon,
  Avatar
} from 'sep-yui';
import ContactListInModal from './ContactList/ContactListInModal.vue';
import NewChatInformationForm from './NewChat/NewChatInformationForm.vue';
import type { IMenuProps, IMenuEmits } from './interfaces/interfaces';

const props = withDefaults(defineProps<IMenuProps>(), {
  open: false
});

const emits = defineEmits<IMenuEmits>();

const menuInfoClasses = computed(() => [
  'menu-info',
  { 'menu-info--open': props.open }
]);

const state = reactive({
  isOpen: false,
  isEditAvatar: false
});

const handleCloseMenu = (): void => {
  state.isOpen = false;
  emits('unmount-collapse', state.isOpen);
};

const unmountUserAdd = (): void => {
  emits('unmount-new-contact', true);
};

const openEditProfileIcon = (): void => {
  state.isEditAvatar = true;
};

const closeEditProfileIcon = (): void => {
  state.isEditAvatar = false;
};

watch(
  () => props.open,
  () => {
    state.isOpen = props.open;
  }
);

const resizeHandler = () => {
  const width = window.innerWidth;
  if (width < 896) {
    state.isOpen = true;
    emits('unmount-collapse', state.isOpen);
  }
  if (width > 896) {
    state.isOpen = false;
    emits('unmount-collapse', state.isOpen);
  }
};

onMounted(() => {
  window.addEventListener('resize', resizeHandler);
});

onUnmounted(() => {
  window.removeEventListener('resize', resizeHandler);
});
</script>

<style scoped>
@import url('../assets/menu-info-users.css');

aside.menu-info {
  background-color: var(--white);
  border-left-color: var(--border-grey);
  border-left-width: 0.5px;
  border-left-style: solid;
  &.menu-info--open .collapse {
    width: 100%;
  }
}

header.menu-info__header {
  display: flex;
  padding: 10px;
  align-items: center;
  justify-content: space-between;
}

section.menu-info__info-section {
  padding: 10px;
  padding-inline: 20px;
  display: grid;
  gap: 10px;
}

.menu-info__user-header {
  display: flex;
  margin: 0;
  align-items: center;
}

.menu-info__user-count {
  display: grid;
  margin-left: 4px;
  place-content: center;
  border-radius: 50%;
  background-color: var(--blue12);
  color: var(--text-black);
  font-size: 12px;
  font-weight: semi-bold;
  line-height: 100%;
  width: 20px;
  height: 20px;
}

:deep(button.tabs__navigation-button) {
  display: flex;
  align-items: center;
}

div.menu-info__buttons {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.menu-info__create-channel {
  display: flex;
  align-items: center;
  font-size: 14px;
  gap: 5px;
  & p {
    padding-block: 10px;
    margin: 0;
  }
  & span {
    font-weight: normal;
    color: var(--text-black);
  }
}
:deep(.tabs__navigation) {
  justify-content: start !important;
  gap: 70px;
}

.menu-info__avatar-button {
  display: flex;
  width: 100%;
  justify-content: center;
}

svg.icon-yui-kit.menu-info__close-icon {
  font-size: 17px;
}

button.menu-info__close-button {
  padding: 6px;
}

:deep(button.tabs__navigation-button) {
  margin-inline: 20px !important;
}
</style>
