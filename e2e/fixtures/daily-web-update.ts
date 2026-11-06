import { createApp, h } from 'vue';
import { useMobileApp } from '../../src/composables/useMobileApp';
import MenuUpdateButton from '../../src/components/Menu/MenuUpdateButton.vue';
import * as calls from '../../src/services/useCallState';
import { deferWebUpdateReload } from '../../src/services/web-update-activity';

createApp({
  setup() {
    const updates = useMobileApp();
    (window as any).dailyUpdateFixture = {
      updates,
      calls,
      deferWebUpdateReload,
      runningVersion: __WEB_UPDATE_VERSION__
    };
    return () => h(MenuUpdateButton);
  }
}).mount('#app');
