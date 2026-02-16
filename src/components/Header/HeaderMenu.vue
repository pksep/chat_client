<template>
  <header
    class="header-menu"
    v-if="isMobile"
    :data-testid="`${props.dataTestid}-HeaderMenu-Container`"
  >
    <nav
      class="header-menu__nav"
      :data-testid="`${props.dataTestid}-HeaderMenu-Navigation`"
    >
      <ul
        class="header-menu__list"
        :data-testid="`${props.dataTestid}-HeaderMenu-List`"
      >
        <Line />
      </ul>
    </nav>
  </header>
</template>

<script lang="ts" setup>
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';
import type { IHeaderMenuProps } from './interfaces/header-menu';
import Line from '../UI/Line.vue';

const props = withDefaults(defineProps<IHeaderMenuProps>(), {
  dataTestid: () => 'HeaderMenu'
});

const { state: isMobile } = useResizeState(MAX_W_MD);
</script>
