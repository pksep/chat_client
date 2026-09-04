<template>
  <span class="chat-icon" aria-hidden="true">
    <img
      class="chat-icon__image chat-icon__image--light"
      src="/images/logo-light.png?v=20260904-2"
      alt=""
    />
    <img
      class="chat-icon__image chat-icon__image--dark"
      src="/images/logo-dark.png?v=20260904-2"
      alt=""
    />
  </span>
</template>

<style scoped>
.chat-icon {
  display: inline-grid;
  overflow: hidden;
}

.chat-icon__image {
  grid-area: 1 / 1;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.chat-icon__image--dark {
  display: none;
}
</style>

<style>
:is([data-theme='dark'], .theme-dark) .chat-icon__image--light {
  display: none;
}

:is([data-theme='dark'], .theme-dark) .chat-icon__image--dark {
  display: block;
}
</style>
