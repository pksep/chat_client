<template>
  <svg
    width="48"
    height="48"
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    :data-testid="`${props.dataTestid}-FileIcon-Svg`"
  >
    <rect
      x="4"
      y="4"
      width="40"
      height="40"
      rx="20"
      :fill="props.isMeSender ? 'white' : '#77A6FF'"
    />
    <path
      d="M25.7578 14.001H26.5332C27.0439 14.001 27.5325 14.2103 27.8848 14.5801L33.1133 20.0703C33.6824 20.668 34 21.4618 34 22.2871V28.5996C34 31.5819 31.5819 34 28.5996 34H19.4004C16.4181 34 14 31.5819 14 28.5996V19.4004C14 16.4181 16.4181 14 19.4004 14H25.7393C25.7454 14.0001 25.7516 14.001 25.7578 14.001ZM26.3047 17.6367C25.4543 16.7864 24.0003 17.3884 24 18.5908V22.6484C24 23.3939 24.6042 23.9988 25.3496 23.999H29.4072C30.6098 23.999 31.2124 22.5448 30.3623 21.6943L26.3047 17.6367Z"
      :fill="!props.isMeSender ? 'white' : '#77A6FF'"
    />
  </svg>
</template>
<script setup lang="ts">
const props = withDefaults(
  defineProps<{ isMeSender: boolean; dataTestid?: string }>(),
  {
    dataTestid: () => 'FileIcon'
  }
);
</script>

<style scoped></style>
