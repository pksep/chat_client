<template>
  <div
    v-if="props.user"
    :class="['user-profile', $attrs.class]"
    @contextmenu="handleClick"
    :data-testid="`${dataTestid}-UserProfile-Container`"
    @click="emits('click')"
  >
    <Avatar
      :url="`${config.CHAT_ERP_PATH_TO_FILE_CDN}/${props.user.avatarUrl}`"
      :alt="props.user.avatarUrl"
      class="user-profile__avatar"
      :initials="props.user.initials"
      :data-testid="`${dataTestid}-UserProfile-Avatar`"
    />
    <h3
      class="user-profile__title"
      :data-testid="`${dataTestid}-UserProfile-Title`"
    >
      {{ props.user.initials }}
    </h3>
    <span
      class="user-profile__ex"
      :data-testid="`${dataTestid}-UserProfile-Ex`"
    >
      @{{ props.user.nickname }}
    </span>
  </div>
</template>

<script lang="ts" setup>
import { Avatar } from '@pksep/yui';
import { IUserProfileProps } from '../interfaces/interfaces';
import { getConfig } from '../../services/useConfig';

const config = getConfig();

const props = withDefaults(defineProps<IUserProfileProps>(), {
  dataTestid: () => 'UserProfile'
});

defineOptions({
  inheritAttrs: false
});

const emits = defineEmits<{
  (e: 'unmount-click', event: MouseEvent): void;
  (e: 'click'): void;
}>();

const handleClick = (event: MouseEvent): void => {
  emits('unmount-click', event);
};
</script>
