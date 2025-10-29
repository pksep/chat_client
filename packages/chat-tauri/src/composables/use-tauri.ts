/*
import { ref, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
// import { getCurrent } from '@tauri-apps/api/window';

export function useTauri() {
  const isTauri = ref(false);
  const platform = ref<'desktop' | 'android' | 'ios' | 'web'>('web');
  const deviceInfo = ref<any>(null);

  const checkPlatform = async () => {
    if (window.__TAURI__) {
      isTauri.value = true;

      try {
        deviceInfo.value = await invoke('get_device_info');
        platform.value = deviceInfo.value.platform.toLowerCase();
      } catch (error) {
        console.error('Failed to get device info:', error);
        platform.value = 'desktop'; // fallback
      }
    }
  };

  const showNotification = async (title: string, body: string) => {
    if (!isTauri.value) return;

    try {
      const { sendNotification } = await import(
        '@tauri-apps/plugin-notification'
      );
      await sendNotification({ title, body });
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  };

  const saveFile = async (data: string, filename: string) => {
    if (!isTauri.value) return;

    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');

      const path = await save({
        defaultPath: filename,
        filters: [
          {
            name: 'Text files',
            extensions: ['txt', 'md']
          }
        ]
      });

      if (path) {
        await writeTextFile(path, data);
      }
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  };

  onMounted(() => {
    checkPlatform();
  });

  return {
    isTauri,
    platform,
    deviceInfo,
    showNotification,
    saveFile
  };
}
 */
