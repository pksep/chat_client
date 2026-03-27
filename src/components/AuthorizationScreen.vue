<template>
  <main class="authorization-screen" data-testid="AuthorizationScreen">
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
        <img
          class="authorization-screen__logo"
          src="/images/sep-chat-logo.svg"
          alt="logotype of Chat Logo"
        />
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
                @click="emits('submit')"
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
                  @click="emits('submit')"
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
          <label
            class="authorization-screen__credentials-label"
            for="chat-identifier"
          >
            Логин
          </label>
          <Input
            id="chat-identifier"
            class="authorization-screen__credentials-input initial"
            placeholder="Введите логин"
            :model-value="props.identifier"
            @update:model-value="value => emits('update:identifier', value)"
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

            <span class="authorization-screen__remember-text"
              >Запомнить аккаунт</span
            >
          </label>

          <Button
            class="authorization-screen__button authorization-screen__button--credentials"
            :disabled="props.isLoading || !props.password || !props.identifier"
            @click="emits('submit-credentials')"
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

        <p v-if="props.errorMessage" class="authorization-screen__error">
          {{ props.errorMessage }}
        </p>

        <p v-if="!props.isCredentialsStep" class="authorization-screen__footer">
          Ссылку вы можете получить у администратора
        </p>
      </div>

      <PushNotification
        v-if="isError"
        title="Ошибка"
        :push-key="notificationKey"
        :description="scanError"
        :type="MessageTypeEnum.error"
        @close="() => (isError = false)"
      />

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
  Icon,
  IconNameEnum,
  Input,
  MessageTypeEnum,
  PushNotification,
  TextFieldEnum
} from '@pksep/yui';
import LinkIcon from './UI/LinkIcon.vue';
import { ref } from 'vue';
import { useQrAuth } from '../composables/useQrAuth';

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
const { isError, isScanning, notificationKey, scanError, scanQrCode } =
  useQrAuth();

const handleInput = (value: string): void => {
  emits('update:url', value);
};

const showPassword = ref(false);

const handleQrAuth = async () => {
  const authResult = await scanQrCode();

  if (authResult) {
    emits('qr-auth-success', authResult);
  }
};
</script>

<style>
@import '../assets/authorization-screen.css';
</style>
