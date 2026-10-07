<template>
  <span class="skeleton-block" aria-hidden="true" />
</template>

<style scoped>
.skeleton-block {
  display: block;
  background-size: 180% 100%;
  background-color: var(--border-table);
  animation: skeleton-animation 1.2s ease-in-out infinite;
}

@keyframes skeleton-animation {
  0%,
  100% {
    background-color: var(--border-table);
  }
  50% {
    background-color: var(--action-disabled-bg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-block {
    animation: none;
  }
}
</style>
