/// <reference types="@capawesome/capacitor-android-edge-to-edge-support" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'sep.pksep.app',
  appName: 'СЭП Чат',
  webDir: 'build',
  plugins: {
    EdgeToEdge: {
      backgroundColor: '#f8f9fd',
      navigationBarColor: '#f8f9fd',
      statusBarColor: '#ffffff'
    }
  }
};

export default config;
