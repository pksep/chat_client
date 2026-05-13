<template>
  <section
    class="menu-panel menu-panel--centered"
    :data-testid="`${props.dataTestid}-MenuCallsPanel-Container`"
  >
    <div class="menu-panel__illustration" aria-hidden="true">
      <svg viewBox="0 0 24 24" class="menu-panel__illustration-icon">
        <path
          d="M7.8 4.4c.6-.6 1.5-.7 2.1-.2l2.1 1.7c.6.5.8 1.4.4 2.1l-1 1.8a1 1 0 0 0 .1 1.1c1.1 1.6 2.5 3 4.1 4.1a1 1 0 0 0 1.1.1l1.8-1c.7-.4 1.6-.2 2.1.4l1.7 2.1c.5.6.4 1.5-.2 2.1l-1.1 1.1c-.9.9-2.2 1.3-3.4 1-2.8-.7-5.4-2.2-7.9-4.7S5.7 11 5 8.2c-.3-1.2.1-2.5 1-3.4l1.8-1.1Z"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.8"
        />
      </svg>
    </div>
    <h3 class="menu-panel__title">Звонки</h3>
    <p class="menu-panel__description">История звонков появится здесь.</p>
  </section>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    dataTestid?: string;
  }>(),
  {
    dataTestid: 'MenuCallsPanel'
  }
);
</script>
