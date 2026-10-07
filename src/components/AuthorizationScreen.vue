<template>
  <main
    class="authorization-screen"
    data-testid="AuthorizationScreen"
    @keydown.enter="handleEnter"
  >
    <section class="authorization-screen__block">
      <div
        :class="{
          'authorization-screen__card': true,
          'authorization-screen__card__gradient': !props.isCredentialsStep
        }"
      >
        <button
          v-if="props.isCredentialsStep"
          class="authorization-screen__back-button"
          type="button"
          @click="emits('back')"
        >
          <Icon :name="IconNameEnum.leftBig" />
          Назад
        </button>

        <ChatIcon class="authorization-screen__logo" />

        <h1 class="authorization-screen__title">Вход в ЧАТ</h1>
        <p
          v-if="!props.isCredentialsStep"
          class="authorization-screen__subtitle"
        >
          Введите корпоративную ссылку
        </p>

        <section
          v-if="!props.isCredentialsStep"
          class="authorization-screen__stack"
        >
          <template v-if="!props.organizations.length">
            <div class="authorization-screen__editor">
              <Input
                @click.stop
                id="chat-server-url"
                class="initial"
                placeholder="Введите ссылку"
                :model-value="props.url"
                @update:model-value="handleInput"
              />

              <Button
                class="authorization-screen__button initial"
                :disabled="props.isLoading"
                @click="submitOrganization"
              >
                {{ props.isLoading ? 'Подключение...' : 'Далее' }}
              </Button>
            </div>
          </template>

          <template v-else>
            <div
              class="authorization-screen__field authorization-screen__field--new"
            >
              <button type="button" @click="emits('add-organization')">
                <div
                  class="authorization-screen__field-icon authorization-screen__field-icon--plus"
                >
                  <Icon :name="IconNameEnum.plus" />
                </div>
                <div class="authorization-screen__field-body">
                  <p class="authorization-screen__field-button-text">
                    Ввести новую ссылку
                  </p>
                </div>
              </button>

              <div
                v-if="props.isAddingNewOrganization"
                class="authorization-screen__editor authorization-screen__editor--saved"
              >
                <Input
                  @click.stop
                  id="chat-server-url"
                  class="initial"
                  placeholder="Введите ссылку"
                  :model-value="props.url"
                  @update:model-value="handleInput"
                />

                <Button
                  class="authorization-screen__button initial"
                  @click="submitOrganization"
                  :disabled="props.isLoading"
                >
                  {{ props.isLoading ? 'Подключение...' : 'Далее' }}
                </Button>
              </div>
            </div>
            <article
              v-for="organization in props.organizations"
              :key="organization"
              class="authorization-screen__saved"
              :class="{
                'authorization-screen__saved--selected':
                  props.selectedOrganization === organization &&
                  !props.isAddingNewOrganization
              }"
            >
              <button
                class="authorization-screen__field authorization-screen__field--saved"
                type="button"
                @click="emits('select-organization', organization)"
              >
                <div
                  class="authorization-screen__field-icon authorization-screen__field-icon--link"
                >
                  <LinkIcon />
                </div>
                <div class="authorization-screen__field-body">
                  <p class="authorization-screen__field-button-text">
                    {{ organization }}
                  </p>
                </div>
                <Icon
                  class="authorization-screen__delete"
                  :name="IconNameEnum.deleteSmall"
                  @click.stop="emits('remove-organization', organization)"
                />
              </button>
            </article>
          </template>
        </section>

        <section v-else class="authorization-screen__credentials">
          <label class="authorization-screen__credentials-label" for="tabel">
            Логин
          </label>
          <Combobox
            id="tabel"
            class="authorization__combobox"
            data-testid="LoginForm-TabelNumber-Combobox"
            placeholder="Введите логин"
            :default-option="props.identifier"
            :options="userOptions"
            @change="handleIdentifierChange"
          />
          <label
            class="authorization-screen__credentials-label"
            for="chat-password"
          >
            Пароль

            <Icon
              :name="showPassword ? IconNameEnum.eye : IconNameEnum.eyeOff"
              @click="showPassword = !showPassword"
            />
          </label>
          <Input
            id="chat-password"
            class="authorization-screen__credentials-input initial"
            placeholder="Введите пароль"
            :type="showPassword ? TextFieldEnum.text : TextFieldEnum.password"
            :model-value="props.password"
            @update:model-value="value => emits('update:password', value)"
          />

          <label class="authorization-screen__remember">
            <Checkbox
              @click.stop
              :size="CheckboxSizeEnum.big"
              @update:model-value="
                emits('update:remember-account', !props.rememberAccount)
              "
              :model-value="props.rememberAccount"
            />

            <span class="authorization-screen__remember-text">
              Запомнить аккаунт
            </span>
          </label>

          <Button
            class="authorization-screen__button authorization-screen__button--credentials"
            :disabled="props.isLoading || !props.password || !props.identifier"
            @click="submitCredentials"
          >
            {{ props.isLoading ? 'Вход...' : 'Войти' }}
          </Button>
        </section>

        <Button
          v-if="!props.isCredentialsStep"
          class="authorization-screen__qr-button"
          :type="ButtonTypeEnum.outline"
          :disabled="props.isLoading"
          :loading="isScanning"
          @click="handleQrAuth"
        >
          Вход с помощью QR
        </Button>

        <p v-if="!props.isCredentialsStep" class="authorization-screen__footer">
          Ссылку вы можете получить у администратора
        </p>
      </div>

      <div class="authorization-screen__toolbar" aria-hidden="true">
        <span
          :class="{
            'authorization-screen__toolbar-circle': true,
            'authorization-screen__toolbar-circle--active':
              !props.isCredentialsStep
          }"
        ></span>
        <span
          :class="{
            'authorization-screen__toolbar-circle': true,
            'authorization-screen__toolbar-circle--active':
              props.isCredentialsStep
          }"
        ></span>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import {
  Button,
  ButtonTypeEnum,
  Checkbox,
  CheckboxSizeEnum,
  Combobox,
  Icon,
  IconNameEnum,
  Input,
  TextFieldEnum
} from '@pksep/yui';
import LinkIcon from './UI/LinkIcon.vue';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useQrAuth } from '../composables/useQrAuth';
import { useBackButtonHandler } from '../composables/useBackButton';
import { showErrorNotification } from '../composables/useNotifications';
import { getUsersList } from '../composables/useUsers';
import { isBotUser } from '../utils/bot';
import ChatIcon from '../components/UI/Icons/ChatIcon.vue';

interface IAuthorizationScreenProps {
  url: string;
  identifier: string;
  password: string;
  rememberAccount: boolean;
  organizations: string[];
  selectedOrganization?: string;
  isAddingNewOrganization?: boolean;
  isCredentialsStep?: boolean;
  errorMessage?: string;
  isLoading?: boolean;
}

interface IAuthorizationScreenEmits {
  (e: 'ready'): void;
  (e: 'update:url', value: string): void;
  (e: 'update:identifier', value: string): void;
  (e: 'update:password', value: string): void;
  (e: 'update:remember-account', value: boolean): void;
  (e: 'select-organization', value: string): void;
  (e: 'add-organization'): void;
  (e: 'remove-organization', value: string): void;
  (e: 'submit'): void;
  (e: 'submit-credentials'): void;
  (e: 'back'): void;
  (
    e: 'qr-auth-success',
    payload: { token: string; organization?: string }
  ): void;
}

const props = defineProps<IAuthorizationScreenProps>();
const emits = defineEmits<IAuthorizationScreenEmits>();
useBackButtonHandler(
  () => props.isCredentialsStep,
  () => emits('back')
);
onMounted(() => emits('ready'));
const { isScanning, scanQrCode } = useQrAuth();

const submitOrganization = () => {
  if (!props.isLoading && props.url.trim()) emits('submit');
};

const submitCredentials = () => {
  if (!props.isLoading && props.identifier.trim() && props.password.trim()) {
    emits('submit-credentials');
  }
};

const handleEnter = async (event: KeyboardEvent) => {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.repeat ||
    props.isLoading
  )
    return;
  if (!(event.target instanceof HTMLInputElement)) return;
  event.preventDefault();
  // Combobox обновляет логин при Enter; ждём обновления props перед отправкой.
  await nextTick();
  if (props.isCredentialsStep) submitCredentials();
  else submitOrganization();
};

const handleInput = (value: string): void => {
  emits('update:url', value);
};

const handleIdentifierChange = (value: string | string[]): void => {
  emits('update:identifier', Array.isArray(value) ? value[0] || '' : value);
};

const showPassword = ref(false);

const handleQrAuth = async () => {
  const authResult = await scanQrCode();

  if (authResult) {
    emits('qr-auth-success', authResult);
  }
};

const getUserLoginValue = (user: any): string =>
  user?.initials || user?.nickname || '';

const userOptions = computed(() =>
  getUsersList()
    .filter(user => !isBotUser(user))
    .map(user => getUserLoginValue(user))
    .filter((value, index, list) => !!value && list.indexOf(value) === index)
);

watch(
  () => props.errorMessage,
  errorMessage => {
    if (errorMessage) {
      showErrorNotification(errorMessage);
    }
  }
);
</script>

<style>
@import '../assets/authorization-screen.css';
</style>
