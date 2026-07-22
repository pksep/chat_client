<template>
  <span
    :class="['favorite-topic-icon', $attrs.class]"
    role="img"
    aria-label="Избранное"
    :data-testid="props.dataTestid"
  >
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M19 21L12 16L5 21V5C5 4.46957 5.21071 3.96086 5.58579 3.58579C5.96086 3.21071 6.46957 3 7 3H17C17.5304 3 18.0391 3.21071 18.4142 3.58579C18.7893 3.96086 19 4.46957 19 5V21Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </span>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    dataTestid?: string;
  }>(),
  {
    dataTestid: 'FavoriteTopicIcon'
  }
);

defineOptions({
  inheritAttrs: false
});
</script>

<style scoped>
.favorite-topic-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2em;
  height: 2em;
  min-width: 2em;
  min-height: 2em;
  border-radius: 50%;
  background: var(--primary-color);
  color: var(--white);
  font-size: var(--size-avatar, 16px);
  user-select: none;
}

.favorite-topic-icon svg {
  width: 24px;
  height: 24px;
}

@media (width <= 768px) {
  .favorite-topic-icon.contact-list__avatar svg {
    width: 30px;
    height: 30px;
  }
}
</style>
