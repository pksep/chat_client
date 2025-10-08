<template>
  <aside :class="[`menu__info`, { collapse: props.open }]" v-if="props.open">
    <header class="menu__info-header">
      <h4>Общий</h4>
      <Button
        class="menu__info-button"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        @click="handleCloseMenu"
      >
        <Icon :name="IconNameEnum.crossLarge" class="menu__button-close-icon" />
      </Button>
    </header>
    <Tabs :tabCount="2">
      <template #header1>
        <span class="menu__info-user">
          Участники
          <div class="menu__info-user-count">8</div>
        </span>
      </template>
      <template #header2> Информация </template>
      <template #tab1>
        <ContactListInModal @unmount-user-add="unmountUserAdd" />
      </template>
      <template #tab2>
        <section class="menu__info-info">
          <slot name="information-menu">
            <div class="menu__info-create-channel">
              <p class="menu__info-title-text">Канал создан:</p>
              <span>
                {{ new Date().toLocaleDateString('ru-RU') }}
              </span>
            </div>
            <button class="menu__info-avatar" @click="openEditProfileIcon">
              <Avatar is-icon />
            </button>
            <Teleport to="body">
              <ModalCroppedAvatar
                :image="null"
                :open="state.isEditAvatar"
                @unmount-close="closeEditProfileIcon"
              />
            </Teleport>
            <div class="buttons-menu__info">
              <Button
                :type="ButtonTypeEnum.secondary"
                :size="SizesEnum.large"
                class="button-menu__info"
              >
                <Icon :name="IconNameEnum.noDistrub" />
                Звук выкл.
              </Button>
              <Button
                :type="ButtonTypeEnum.secondary"
                :size="SizesEnum.large"
                class="button-menu__info"
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
import { onMounted, onUnmounted, reactive, watch } from 'vue';
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

aside.menu__info {
  background-color: var(--white);
  border-left-color: var(--border-grey);
  border-left-width: 0.5px;
  border-left-style: solid;
  & .collapse {
    width: 100%;
  }
}

header.menu__info-header {
  display: flex;
  padding: 10px;
  align-items: center;
  justify-content: space-between;
}

section.menu__info-info {
  padding: 10px;
  padding-inline: 20px;
  display: grid;
  gap: 10px;
}

.menu__info-user {
  display: flex;
  margin: 0;
  align-items: center;
}

.menu__info-user-count {
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

div.buttons-menu__info {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.menu__info-create-channel {
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

.menu__info-avatar {
  display: flex;
  width: 100%;
  justify-content: center;
}

svg.icon-yui-kit.menu__button-close-icon {
  font-size: 17px;
}

button.menu__info-button {
  padding: 6px;
}

:deep(button.tabs__navigation-button) {
  margin-inline: 20px !important;
}
</style>
