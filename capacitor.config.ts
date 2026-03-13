/// <reference types="@capawesome/capacitor-android-edge-to-edge-support" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'sep.pksep.app',
  appName: 'SEP:Chat',
  webDir: 'build',
  plugins: {
    EdgeToEdge: {
      backgroundColor: '#ffffff', // Общий цвет фона
      navigationBarColor: '#ffffff', // Цвет нижней панели навигации
      statusBarColor: '#ffffff' // Цвет верхней строки состояния
    }
  }
};

export default config;
