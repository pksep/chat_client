<template>
  <aside
    :class="[`menu__info`, { collapse: !state.isCollapse }]"
    v-if="!props.open"
  >
    <header class="menu__info-header">
      <h4>Общий</h4>
      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.small"
        @click="handleCloseMenu"
      >
        <Icon :name="IconNameEnum.crossLarge" />
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
        <ContactListInModal />
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
            <div class="menu__info-avatar">
              <Avatar is-icon />
            </div>
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
  isCollapse: false
});

const handleCloseMenu = (): void => {
  state.isCollapse = true;
  emits('unmount-collapse', state.isCollapse);
};

watch(
  () => props.open,
  () => {
    state.isCollapse = props.open;
  }
);

onMounted(() => {
  window.addEventListener('resize', () => {
    const width = window.innerWidth;
    if (width < 896) {
      state.isCollapse = true;
      emits('unmount-collapse', state.isCollapse);
    }
    if (width > 896) {
      state.isCollapse = false;
      emits('unmount-collapse', state.isCollapse);
    }
  });
});

onUnmounted(() => {
  document.removeEventListener('resize', null);
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
  padding-bottom: 7px;
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

.menu__info-title-text {
  color: var(--text-grey);
  font-weight: 600;
  font-size: 14px;
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

.menu__info-avatar {
  display: flex;
  width: 100%;
  justify-content: center;
}
</style>
