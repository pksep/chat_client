<template>
  <DesktopTitleBar />
  <CallModal />
  <DesktopCallContextMenu />
</template>

<script setup lang="ts">
import { provide } from 'vue';
import CallModal from '../CallModal/CallModal.vue';
import DesktopTitleBar from './DesktopTitleBar.vue';
import DesktopCallContextMenu from './DesktopCallContextMenu.vue';
import {
  desktopCallWindowContextKey,
  type DesktopCallWindowContext
} from './call-window-context';

const props = defineProps<{ context: DesktopCallWindowContext }>();
provide(desktopCallWindowContextKey, props.context);
</script>
